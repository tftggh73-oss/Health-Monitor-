// ===== FIREBASE CONFIGURATION =====
const firebaseConfig = {
  apiKey: "AIzaSyBM8QrJvGrk1r3UVeJB05e3YHVsuinwQ_M",
  authDomain: "health-monitor-iot-7b603.firebaseapp.com",
  databaseURL: "https://health-monitor-iot-7b603-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "health-monitor-iot-7b603",
  storageBucket: "health-monitor-iot-7b603.firebasestorage.app",
  messagingSenderId: "291381979405",
  appId: "1:291381979405:web:1ce0164f2dfc721b032844"
};

// Khởi tạo Firebase
firebase.initializeApp(firebaseConfig);
const database = firebase.database();

// Biến toàn cục điều khiển hệ thống
let dailyChart;
let currentPatientId = null;
let currentPatientName = "";
let patientListenerRef = null;
let aiListenerRef = null;
let latestMeasurement = null;

// Dữ liệu cho biểu đồ Realtime
let labels = [];
let spo2Data = [];
let tempData = [];
let hrData = [];

let spo2Chart;
let tempChart;
let hrChart;

// ===== HÀM DÙNG CHUNG =====
function toNumber(value) {
  const n = parseFloat(value);
  return Number.isNaN(n) ? null : n;
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

function normalizeGender(gender) {
  const g = String(gender || "").trim().toLowerCase();
  if (["nam", "male", "m", "1"].includes(g)) return "nam";
  if (["nữ", "nu", "female", "f", "0"].includes(g)) return "nu";
  return "nam";
}

function getHrBounds(age, gender) {
  const g = normalizeGender(gender);
  const isMale = g === "nam";

  let a = parseInt(age, 10);
  if (Number.isNaN(a)) a = 25;

  if (a < 1) return isMale ? { min: 102, max: 155 } : { min: 104, max: 156 };
  if (a === 1) return isMale ? { min: 95, max: 137 } : { min: 95, max: 139 };
  if (a >= 2 && a <= 3) return isMale ? { min: 85, max: 124 } : { min: 88, max: 125 };
  if (a >= 4 && a <= 5) return isMale ? { min: 74, max: 112 } : { min: 76, max: 117 };
  if (a >= 6 && a <= 8) return isMale ? { min: 66, max: 105 } : { min: 69, max: 106 };
  if (a >= 9 && a <= 11) return isMale ? { min: 61, max: 97 } : { min: 66, max: 103 };
  if (a >= 12 && a <= 15) return isMale ? { min: 57, max: 97 } : { min: 60, max: 99 };
  if (a >= 16 && a <= 19) return isMale ? { min: 52, max: 92 } : { min: 58, max: 99 };
  if (a >= 20 && a <= 39) return isMale ? { min: 52, max: 89 } : { min: 57, max: 95 };
  if (a >= 40 && a <= 59) return isMale ? { min: 52, max: 90 } : { min: 56, max: 92 };
  if (a >= 60 && a <= 79) return isMale ? { min: 50, max: 91 } : { min: 56, max: 92 };
  if (a >= 80) return isMale ? { min: 51, max: 94 } : { min: 56, max: 93 };

  return { min: 60, max: 100 };
}

function getCurrentPatientProfile() {
  const ageVal = document.getElementById("infoAgeInput")?.value;
  const genderVal = document.getElementById("infoGenderInput")?.value;
  return {
    age: parseInt(ageVal, 10) || 25,
    gender: genderVal || "Nam"
  };
}

function applySpo2Color(el, spo2) {
  if (!el) return;
  el.classList.remove("safe", "warning", "danger");
  if (spo2 === null || Number.isNaN(spo2)) return;

  if (spo2 > 96) el.classList.add("safe");
  else if (spo2 >= 92) el.classList.add("warning");
  else el.classList.add("danger");
}

function applyTempColor(el, temp) {
  if (!el) return;
  el.classList.remove("safe", "warning", "danger");
  if (temp === null || Number.isNaN(temp)) return;

  if (temp > 39 || temp <= 35) el.classList.add("danger");
  else if ((temp > 37.5 && temp <= 39) || (temp > 35 && temp < 36.5)) el.classList.add("warning");
  else el.classList.add("safe");
}

function applyHrColor(el, heartRate, age = 25, gender = "Nam") {
  if (!el) return;
  el.classList.remove("safe", "warning", "danger");
  if (heartRate === null || Number.isNaN(heartRate)) return;

  const bounds = getHrBounds(age, gender);

  if (heartRate < (bounds.min - 15) || heartRate > (bounds.max + 20)) {
    el.classList.add("danger");
  } else if (heartRate < bounds.min || heartRate > bounds.max) {
    el.classList.add("warning");
  } else {
    el.classList.add("safe");
  }
}

function isMeasurementPageVisible() {
  const page = document.getElementById("measurementPage");
  return page && page.style.display !== "none";
}

// ===== 1. HỆ THỐNG TAB & ĐIỀU HƯỚNG =====

function showTab(tabId) {
  document.querySelectorAll(".tab").forEach(tab => {
    tab.style.display = "none";
  });

  const tab = document.getElementById(tabId);
  if (tab) tab.style.display = "block";

  if (tabId === "analytics") {
    loadDailyData();
  }
}

function showMeasurementTab(tabId) {
  document.querySelectorAll(".measurement-tab").forEach(tab => {
    tab.style.display = "none";
  });

  const tab = document.getElementById(tabId);
  if (tab) tab.style.display = "block";
}

function openMeasurementPage() {
  document.getElementById("patientListPage").style.display = "none";
  document.getElementById("patientDashboard").style.display = "none";
  document.getElementById("measurementPage").style.display = "block";
  showMeasurementTab("currentResult");
}

function backToPatientList() {
  document.getElementById("measurementPage").style.display = "none";
  document.getElementById("patientDashboard").style.display = "none";
  document.getElementById("patientListPage").style.display = "block";
}

function selectPatient(patientId, patientName) {
  currentPatientId = patientId;
  currentPatientName = patientName;

  document.getElementById("patientListPage").style.display = "none";
  document.getElementById("measurementPage").style.display = "none";
  document.getElementById("patientDashboard").style.display = "block";

  document.getElementById("selectedPatientName").innerText = patientName;
  document.getElementById("selectedPatientId").innerText = "Mã bệnh nhân: " + patientId;

  resetPatientUI();
  showTab("live");
  loadPatientHistory();
  loadPatientInfo(patientId, patientName);
  listenToAIAlerts(patientId);
}

function goBack() {
  if (patientListenerRef) {
    patientListenerRef.off();
    patientListenerRef = null;
  }

  if (aiListenerRef) {
    aiListenerRef.off();
    aiListenerRef = null;
  }

  currentPatientId = null;
  currentPatientName = "";

  document.getElementById("patientDashboard").style.display = "none";
  document.getElementById("measurementPage").style.display = "none";
  document.getElementById("patientListPage").style.display = "block";

  resetPatientUI();
}

// ===== 2. THÔNG TIN BỆNH NHÂN =====

function savePatientInfo() {
  if (!currentPatientId) {
    alert("Chưa chọn bệnh nhân");
    return;
  }

  const name = document.getElementById("infoNameInput").value.trim();
  const ageValue = document.getElementById("infoAgeInput").value.trim();
  const gender = document.getElementById("infoGenderInput").value;
  const age = Number(ageValue);

  if (!name) {
    alert("Vui lòng nhập họ tên");
    return;
  }

  if (ageValue === "") {
    alert("Vui lòng nhập tuổi");
    return;
  }

  if (!Number.isInteger(age) || age < 0 || age > 120) {
    alert("Tuổi phải là số nguyên từ 0 đến 120");
    return;
  }

  if (!gender) {
    alert("Vui lòng chọn giới tính");
    return;
  }

  database.ref("patients/" + currentPatientId + "/profile").set({
    name: name,
    age: age,
    gender: gender
  })
  .then(() => {
    currentPatientName = name;

    document.getElementById("selectedPatientName").innerText = name;

    const label = document.getElementById("patientLabel_" + currentPatientId);
    if (label) label.innerText = name;

    const saveBtnLabel = document.getElementById("saveBtnLabel_" + currentPatientId);
    if (saveBtnLabel) saveBtnLabel.innerText = name;

    alert("Đã lưu thông tin bệnh nhân");
  })
  .catch((error) => {
    console.error("Lỗi lưu thông tin:", error);
    alert("Lưu thất bại");
  });
}

function loadPatientLabels() {
  const patientIds = ["patient_01", "patient_02", "patient_03", "patient_04", "patient_05"];

  patientIds.forEach(patientId => {
    database.ref("patients/" + patientId + "/profile/name").once("value", function(snapshot) {
      const savedName = snapshot.val();
      const label = document.getElementById("patientLabel_" + patientId);

      if (savedName && label) {
        label.innerText = savedName;
      }

      const saveBtnLabel = document.getElementById("saveBtnLabel_" + patientId);
      if (savedName && saveBtnLabel) {
        saveBtnLabel.innerText = savedName;
      }
    });
  });
}

function loadPatientInfo(patientId, patientName) {
  database.ref("patients/" + patientId + "/profile").once("value", function(snapshot) {
    const data = snapshot.val();

    if (data) {
      document.getElementById("infoNameInput").value = data.name || "";
      document.getElementById("infoAgeInput").value = data.age || "";
      document.getElementById("infoGenderInput").value = data.gender || "";
    } else {
      document.getElementById("infoNameInput").value = patientName || "";
      document.getElementById("infoAgeInput").value = "";
      document.getElementById("infoGenderInput").value = "";
    }
  });

  database.ref("patients/" + patientId + "/alerts").once("value", function(snapshot) {
    const data = snapshot.val();

    if (!data) {
      document.getElementById("infoAiStatus").innerText = "Chưa có dữ liệu";
      document.getElementById("infoAiAdvice").innerText = "Chưa có kết quả AI gần nhất.";
      document.getElementById("infoAiTime").innerText = "--:--:--";
      return;
    }

    document.getElementById("infoAiStatus").innerText = data.current_status || data.status || "--";
    document.getElementById("infoAiAdvice").innerText = data.advice || data.ai_prediction || "--";
    document.getElementById("infoAiTime").innerText = data.timestamp_ai || "--:--:--";
  });
}

// ===== 3. LƯU KẾT QUẢ CHO BỆNH NHÂN =====

function saveResultForPatient(patientId, patientName) {
  if (!patientId) {
    alert("Chưa chọn bệnh nhân");
    return;
  }

  const spo2Text = document.getElementById("liveSpo2")?.innerText || "--";
  const tempText = document.getElementById("liveTemp")?.innerText || "--";
  const hrText = document.getElementById("liveHr")?.innerText || "--";
  const measureTime = document.getElementById("measureTime")?.innerText || "--:--:--";

  if (spo2Text === "--" || tempText === "--" || hrText === "--") {
    alert("Chưa có dữ liệu để lưu");
    return;
  }

  const spo2 = parseFloat(spo2Text);
  const temp = parseFloat(tempText);
  const hr = parseFloat(hrText);

  if (Number.isNaN(spo2) || Number.isNaN(temp) || Number.isNaN(hr)) {
    alert("Dữ liệu đo chưa hợp lệ");
    return;
  }

  database.ref("patients/" + patientId + "/profile").once("value")
    .then((snapshot) => {
      const profile = snapshot.val();

      if (!profile) {
        alert("Vui lòng lưu thông tin bệnh nhân trước");
        throw new Error("NO_PROFILE");
      }

      const name = (profile.name || "").trim();
      const age = Number(profile.age);
      const gender = profile.gender || "";

      if (!name) {
        alert("Bệnh nhân chưa có họ tên");
        throw new Error("INVALID_NAME");
      }

      if (!Number.isInteger(age) || age < 0 || age > 120) {
        alert("Bệnh nhân chưa có tuổi hợp lệ");
        throw new Error("INVALID_AGE");
      }

      if (!gender) {
        alert("Bệnh nhân chưa có giới tính");
        throw new Error("INVALID_GENDER");
      }

      const now = new Date();
      const recordTimestamp = latestMeasurement?.timestamp || now.toISOString();

      const record = {
        timestamp: recordTimestamp,
        time: latestMeasurement?.espTime || measureTime,
        spo2: spo2,
        temperature: temp,
        temp: temp,
        heart_rate: hr,
        hr: hr,
        patient_name: name,
        age: age,
        gender: gender,
        saved_at: now.toISOString(),
        measure_time: measureTime,
        source: "manual_save"
      };

      return database.ref("patients/" + patientId + "/healthData").push(record)
        .then(() => {
          return database.ref("trigger_analysis").set({
            patient_id: patientId,
            timestamp: now.toISOString(),
            requested_from: "web_app"
          });
        });
    })
    .then(() => {
      if (currentPatientId === patientId) {
        loadPatientHistory();
        loadPatientInfo(patientId, patientName);
      }
      alert("Đã lưu kết quả cho " + patientName + ". AI đang phân tích...");
    })
    .catch((error) => {
      if (
        error.message !== "NO_PROFILE" &&
        error.message !== "INVALID_NAME" &&
        error.message !== "INVALID_AGE" &&
        error.message !== "INVALID_GENDER"
      ) {
        console.error("Lỗi lưu dữ liệu:", error);
        alert("Lưu thất bại");
      }
    });
}

// ===== 4. RESET UI =====

function resetPatientUI() {
  document.getElementById("spo2").innerText = "--";
  document.getElementById("temp").innerText = "--";
  document.getElementById("ecg").innerText = "--";

  if (document.getElementById("ai-status")) {
    document.getElementById("ai-status").innerText = "Đang chờ dữ liệu...";
    document.getElementById("ai-advice").innerText = "Hệ thống AI đang khởi động...";
    document.getElementById("ai-risk").innerText = "0";
    document.getElementById("ai-time").innerText = "--:--:--";
    document.getElementById("ai-status-box").className = "";
  }

  document.getElementById("historyList").innerHTML = "";

  document.getElementById("spo2").classList.remove("safe", "warning", "danger");
  document.getElementById("temp").classList.remove("safe", "warning", "danger");
  document.getElementById("ecg").classList.remove("safe", "warning", "danger");

  if (document.getElementById("trendComment")) {
    document.getElementById("trendComment").innerText = "Đang phân tích dữ liệu...";
  }

  labels.length = 0;
  spo2Data.length = 0;
  tempData.length = 0;
  hrData.length = 0;

  if (spo2Chart) {
    spo2Chart.data.labels = labels;
    spo2Chart.data.datasets[0].data = spo2Data;
    spo2Chart.update();
  }

  if (tempChart) {
    tempChart.data.labels = labels;
    tempChart.data.datasets[0].data = tempData;
    tempChart.update();
  }

  if (hrChart) {
    hrChart.data.labels = labels;
    hrChart.data.datasets[0].data = hrData;
    hrChart.update();
  }

  if (dailyChart) {
    dailyChart.destroy();
    dailyChart = null;
  }

  if (document.getElementById("liveSpo2")) {
    document.getElementById("liveSpo2").innerText = "--";
    document.getElementById("liveTemp").innerText = "--";
    document.getElementById("liveHr").innerText = "--";
    document.getElementById("measureTime").innerText = "--:--:--";
    document.getElementById("saveSpo2").innerText = "--";
    document.getElementById("saveTemp").innerText = "--";
    document.getElementById("saveHr").innerText = "--";
    document.getElementById("saveTime").innerText = "--:--:--";

    document.getElementById("liveSpo2").classList.remove("safe", "warning", "danger");
    document.getElementById("liveTemp").classList.remove("safe", "warning", "danger");
    document.getElementById("liveHr").classList.remove("safe", "warning", "danger");
  }

  if (document.getElementById("infoNameInput")) {
    document.getElementById("infoNameInput").value = "";
    document.getElementById("infoAgeInput").value = "";
    document.getElementById("infoGenderInput").value = "";
    document.getElementById("infoAiStatus").innerText = "Đang chờ dữ liệu...";
    document.getElementById("infoAiAdvice").innerText = "Chưa có dữ liệu AI.";
    document.getElementById("infoAiTime").innerText = "--:--:--";
  }
}

// ===== 5. HỆ THỐNG DỰ BÁO AI =====

function listenToAIAlerts(patientId) {
  if (aiListenerRef) aiListenerRef.off();

  aiListenerRef = database.ref("patients/" + patientId + "/alerts");

  aiListenerRef.on("value", (snapshot) => {
    const data = snapshot.val();
    if (!data) return;

    const statusEl = document.getElementById("ai-status");
    const adviceEl = document.getElementById("ai-advice");
    const timeEl = document.getElementById("ai-time");
    const riskEl = document.getElementById("ai-risk");
    const statusBox = document.getElementById("ai-status-box");

    const safeStatus = data.current_status || data.status || data.message || "--";
    const safeAdvice = data.advice || data.ai_prediction || data.message || "Chưa có lời khuyên từ AI.";
    const safeTime = data.timestamp_ai || "--:--:--";
    const safeRisk = Math.round((data.risk_score || 0) * 100);

    if (statusEl) statusEl.innerText = safeStatus;
    if (adviceEl) adviceEl.innerText = safeAdvice;
    if (timeEl) timeEl.innerText = safeTime;
    if (riskEl) riskEl.innerText = safeRisk;

    const measureStatusEl = document.getElementById("measureAiStatus");
    const measureAdviceEl = document.getElementById("measureAiAdvice");
    const measureRiskEl = document.getElementById("measureRisk");

    if (measureStatusEl) measureStatusEl.innerText = safeStatus;
    if (measureAdviceEl) measureAdviceEl.innerText = safeAdvice;
    if (measureRiskEl) measureRiskEl.innerText = safeRisk;

    if (document.getElementById("infoAiStatus")) {
      document.getElementById("infoAiStatus").innerText = safeStatus;
      document.getElementById("infoAiAdvice").innerText = safeAdvice;
      document.getElementById("infoAiTime").innerText = safeTime;
    }

    if (statusBox) {
      statusBox.classList.remove("ai-safe", "ai-warning", "ai-danger");
      if (Number(data.status_code) === 0) {
        statusBox.classList.add("ai-safe");
      } else if (Number(data.status_code) === 1) {
        statusBox.classList.add("ai-warning");
      } else if (Number(data.status_code) === 2) {
        statusBox.classList.add("ai-danger");
      }
    }
  });
}

// ===== 6. KHỞI TẠO BIỂU ĐỒ KHI TẢI TRANG =====

window.onload = function() {
  const spo2Ctx = document.getElementById("spo2Chart").getContext("2d");
  const tempCtx = document.getElementById("tempChart").getContext("2d");
  const hrCtx = document.getElementById("hrChart").getContext("2d");

  spo2Chart = new Chart(spo2Ctx, {
    type: "line",
    data: {
      labels: labels,
      datasets: [{
        label: "SpO2 (%)",
        data: spo2Data,
        borderColor: "blue",
        fill: false
      }]
    }
  });

  tempChart = new Chart(tempCtx, {
    type: "line",
    data: {
      labels: labels,
      datasets: [{
        label: "Temperature (°C)",
        data: tempData,
        borderColor: "red",
        fill: false
      }]
    }
  });

  hrChart = new Chart(hrCtx, {
    type: "line",
    data: {
      labels: labels,
      datasets: [{
        label: "Heart Rate (BPM)",
        data: hrData,
        borderColor: "green",
        fill: false
      }]
    }
  });

  loadPatientLabels();
};

// ===== 7. MQTT CONFIGURATION & DATA PROCESSING =====

const host = "wss://c5c491454563470fad86602d8132fcab.s1.eu.hivemq.cloud:8884/mqtt";
const options = {
  username: "device01",
  password: "Device2026"
};

const client = mqtt.connect(host, options);

client.on("connect", function() {
  console.log("MQTT Connected");
  client.subscribe("health/device01/data");
});

client.on("message", function(topic, message) {
  let data;
  try {
    data = JSON.parse(message.toString());
  } catch (error) {
    console.error("MQTT parse error:", error);
    return;
  }

  console.log("MQTT DATA:", data);

  const now = new Date();
  const espTime = data.time || null;

  const timestamp = espTime
    ? `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}T${espTime}`
    : (data.timestamp || now.toISOString());

  const displayTime = espTime || now.toLocaleTimeString();

  const spo2 = toNumber(data.spo2);
  const temp = toNumber(data.temperature ?? data.temp);
  const heartRate = toNumber(data.heart_rate ?? data.bpm ?? data.hr ?? data.heartRate);

  latestMeasurement = {
    timestamp: timestamp,
    espTime: espTime,
    displayTime: displayTime,
    spo2: spo2,
    temperature: temp,
    heart_rate: heartRate
  };

  // Chỉ đẩy luồng thô chung cho AI buffer
  if (spo2 !== null && temp !== null && heartRate !== null) {
    database.ref("healthData").push({
      timestamp: timestamp,
      time: espTime || displayTime,
      spo2: spo2,
      temperature: temp,
      temp: temp,
      heart_rate: heartRate,
      hr: heartRate,
      source: "esp32_stream"
    });
  }

  // Chỉ cập nhật giao diện trang đo hiện tại
  if (!isMeasurementPageVisible()) {
    return;
  }

  const liveSpo2El = document.getElementById("liveSpo2");
  const liveTempEl = document.getElementById("liveTemp");
  const liveHrEl = document.getElementById("liveHr");

  if (!liveSpo2El || !liveTempEl || !liveHrEl) {
    return;
  }

  liveSpo2El.innerText = spo2 ?? "--";
  liveTempEl.innerText = temp ?? "--";
  liveHrEl.innerText = heartRate ?? "--";
  document.getElementById("measureTime").innerText = displayTime;

  document.getElementById("saveSpo2").innerText = spo2 ?? "--";
  document.getElementById("saveTemp").innerText = temp ?? "--";
  document.getElementById("saveHr").innerText = heartRate ?? "--";
  document.getElementById("saveTime").innerText = displayTime;

  const profile = getCurrentPatientProfile();

  applySpo2Color(liveSpo2El, spo2);
  applyTempColor(liveTempEl, temp);
  applyHrColor(liveHrEl, heartRate, profile.age, profile.gender);
});

client.on("error", function(err) {
  console.log("MQTT Error:", err);
});

// ===== 8. LỊCH SỬ DỮ LIỆU =====

function loadPatientHistory() {
  if (!currentPatientId) return;

  if (patientListenerRef) {
    patientListenerRef.off();
  }

  patientListenerRef = database.ref("patients/" + currentPatientId + "/healthData");

  patientListenerRef.on("value", function(snapshot) {
    const data = snapshot.val();
    const historyList = document.getElementById("historyList");
    historyList.innerHTML = "";

    labels.length = 0;
    spo2Data.length = 0;
    tempData.length = 0;
    hrData.length = 0;

    if (!data) {
      spo2Chart.update();
      tempChart.update();
      hrChart.update();
      return;
    }

    const records = Object.values(data).sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

    const latest20 = records.slice(-20);
    latest20.forEach(item => {
      const displayTime = item.measure_time || new Date(item.timestamp).toLocaleString();
      labels.push(displayTime);
      spo2Data.push(Number(item.spo2));
      tempData.push(Number(item.temperature ?? item.temp));
      hrData.push(Number(item.heart_rate ?? item.hr));
    });

    const latest = records[records.length - 1];
    if (latest) {
      updateLatestPatient(latest);
    }

    records.slice().reverse().forEach(item => {
      const displayTime = item.measure_time || new Date(item.timestamp).toLocaleString();
      const card = document.createElement("div");
      card.className = "card";
      card.innerHTML = `
        <p><strong>${displayTime}</strong></p>
        <p>SpO2: ${item.spo2}% | Temp: ${item.temperature ?? item.temp}°C | Heart Rate: ${item.heart_rate ?? item.hr} BPM</p>
      `;
      historyList.appendChild(card);
    });

    spo2Chart.update();
    tempChart.update();
    hrChart.update();
  });
}

function updateLatestPatient(item) {
  const spo2 = Number(item.spo2);
  const temp = Number(item.temperature ?? item.temp);
  const heartRate = Number(item.heart_rate ?? item.hr);

  const spo2El = document.getElementById("spo2");
  const tempEl = document.getElementById("temp");
  const hrEl = document.getElementById("ecg");

  spo2El.innerText = Number.isNaN(spo2) ? "--" : spo2;
  tempEl.innerText = Number.isNaN(temp) ? "--" : temp;
  hrEl.innerText = Number.isNaN(heartRate) ? "--" : heartRate;

  const age = item.age || parseInt(document.getElementById("infoAgeInput")?.value, 10) || 25;
  const gender = item.gender || document.getElementById("infoGenderInput")?.value || "Nam";

  applySpo2Color(spo2El, spo2);
  applyTempColor(tempEl, temp);
  applyHrColor(hrEl, heartRate, age, gender);
}

// ===== 9. PHÂN TÍCH DỮ LIỆU THEO NGÀY =====

function loadDailyData() {
  if (!currentPatientId) return;

  database.ref("patients/" + currentPatientId + "/healthData").once("value", function(snapshot) {
    const data = snapshot.val();
    if (!data) return;

    const grouped = {};
    Object.values(data).forEach(item => {
      const date = item.timestamp.substring(0, 10);
      if (!grouped[date]) {
        grouped[date] = { spo2: [], temp: [], hr: [] };
      }
      grouped[date].spo2.push(Number(item.spo2));
      grouped[date].temp.push(Number(item.temperature ?? item.temp));
      grouped[date].hr.push(Number(item.heart_rate ?? item.hr));
    });

    const dates = Object.keys(grouped).sort().slice(-3);
    const avgSpo2 = [];
    const avgTemp = [];
    const avgHR = [];

    dates.forEach(d => {
      const spo2Arr = grouped[d].spo2;
      const tempArr = grouped[d].temp;
      const hrArr = grouped[d].hr;

      const spo2Avg = spo2Arr.reduce((a, b) => a + b, 0) / spo2Arr.length;
      const tempAvg = tempArr.reduce((a, b) => a + b, 0) / tempArr.length;
      const hrAvg = hrArr.reduce((a, b) => a + b, 0) / hrArr.length;

      avgSpo2.push(Number(spo2Avg.toFixed(1)));
      avgTemp.push(Number(tempAvg.toFixed(1)));
      avgHR.push(Number(hrAvg.toFixed(1)));
    });

    drawDailyChart(dates, avgSpo2, avgTemp, avgHR);
    updateTrendComment(dates, avgSpo2, avgTemp, avgHR);
  });
}

function updateTrendComment(dates, avgSpo2, avgTemp, avgHR) {
  const trendEl = document.getElementById("trendComment");
  if (!trendEl) return;

  if (!dates || dates.length < 2) {
    trendEl.innerText = "Chưa đủ dữ liệu để đánh giá xu hướng trong 3 ngày gần nhất.";
    return;
  }

  const spo2First = avgSpo2[0];
  const spo2Last = avgSpo2[avgSpo2.length - 1];

  const tempFirst = avgTemp[0];
  const tempLast = avgTemp[avgTemp.length - 1];

  const hrFirst = avgHR[0];
  const hrLast = avgHR[avgHR.length - 1];

  let spo2Text = "";
  let tempText = "";
  let hrText = "";

  if (spo2Last > spo2First) spo2Text = "SpO2 có xu hướng tăng";
  else if (spo2Last < spo2First) spo2Text = "SpO2 có xu hướng giảm";
  else spo2Text = "SpO2 tương đối ổn định";

  if (tempLast > tempFirst) tempText = "nhiệt độ có xu hướng tăng";
  else if (tempLast < tempFirst) tempText = "nhiệt độ có xu hướng giảm";
  else tempText = "nhiệt độ tương đối ổn định";

  if (hrLast > hrFirst) hrText = "nhịp tim có xu hướng tăng";
  else if (hrLast < hrFirst) hrText = "nhịp tim có xu hướng giảm";
  else hrText = "nhịp tim tương đối ổn định";

  trendEl.innerText = `${spo2Text}, ${tempText}, ${hrText} trong những lần đo gần đây.`;
}

function drawDailyChart(dates, spo2DataVals, tempDataVals, hrDataVals) {
  const canvas = document.getElementById("dailyChart");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");

  if (dailyChart) {
    dailyChart.destroy();
  }

  dailyChart = new Chart(ctx, {
    type: "bar",
    data: {
      labels: dates,
      datasets: [
        {
          label: "Avg SpO2",
          data: spo2DataVals,
          backgroundColor: "#66b3ff"
        },
        {
          label: "Avg Temperature",
          data: tempDataVals,
          backgroundColor: "#ff9999"
        },
        {
          label: "Avg Heart Rate",
          data: hrDataVals,
          backgroundColor: "#66ff99"
        }
      ]
    }
  });
}

// ===== 10. TÍCH HỢP XEM KẾT QUẢ ĐO AI =====

document.addEventListener("DOMContentLoaded", () => {
  const btnXemKetQua = document.getElementById("btn-xem-ket-qua");
  const ketQuaBox = document.getElementById("ket-qua-box");

  if (btnXemKetQua && ketQuaBox) {
    btnXemKetQua.addEventListener("click", () => {
      btnXemKetQua.innerText = "Đang tải dữ liệu...";
      btnXemKetQua.disabled = true;

      if (!currentPatientId) {
        alert("Vui lòng chọn bệnh nhân trước");
        btnXemKetQua.innerText = "Xem kết quả đo";
        btnXemKetQua.disabled = false;
        return;
      }

      database.ref("patients/" + currentPatientId + "/alerts").once("value")
        .then((snapshot) => {
          if (snapshot.exists()) {
            const data = snapshot.val();

            document.getElementById("val-hr").innerText = data.heart_rate ?? "--";
            document.getElementById("val-temp").innerText = data.temperature ?? "--";
            document.getElementById("val-spo2").innerText = data.spo2 ?? "--";

            document.getElementById("val-current-status").innerText = data.current_status || "--";
            document.getElementById("val-ai-advice").innerText = data.ai_prediction || data.advice || "--";
            document.getElementById("val-time").innerText = data.timestamp_ai || "--:--:--";

            const statusEl = document.getElementById("val-ai-advice");
            if (Number(data.status_code) === 2) {
              statusEl.style.color = "red";
            } else if (Number(data.status_code) === 1) {
              statusEl.style.color = "orange";
            } else {
              statusEl.style.color = "green";
            }

            ketQuaBox.style.display = "block";
          } else {
            alert("Chưa có dữ liệu phân tích từ AI. Vui lòng lưu kết quả đo trước.");
          }
        })
        .catch((error) => {
          console.error("Lỗi khi tải dữ liệu:", error);
          alert("Lỗi kết nối đến cơ sở dữ liệu.");
        })
        .finally(() => {
          btnXemKetQua.innerText = "Xem kết quả đo";
          btnXemKetQua.disabled = false;
        });
    });
  }
});
