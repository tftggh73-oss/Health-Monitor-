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
let aiListenerRef = null; // Quản lý lắng nghe AI
let latestMeasurement = null;

// Dữ liệu cho biểu đồ Realtime
let labels = [];
let spo2Data = [];
let tempData = [];
let hrData = [];

let spo2Chart;
let tempChart;
let hrChart;

// ===== HÀM DÙNG CHUNG CHO MÀU SẮC =====
// Đồng nhất hơn với logic AI:
// SpO2: xanh >96, vàng 92-96, đỏ <92
// Temp: xanh 36.5-37.5, vàng lệch nhẹ, đỏ lệch nặng

function applySpo2Color(el, spo2) {
  if (!el) return;
  el.classList.remove("safe", "warning", "danger");
  if (isNaN(spo2)) return;

  if (spo2 > 96) {
    el.classList.add("safe");
  } else if (spo2 >= 92) {
    el.classList.add("warning");
  } else {
    el.classList.add("danger");
  }
}

function applyTempColor(el, temp) {
  if (!el) return;
  el.classList.remove("safe", "warning", "danger");
  if (isNaN(temp)) return;

  if (temp > 39 || temp <= 35) {
    el.classList.add("danger");
  } else if ((temp > 37.5 && temp <= 39) || (temp > 35 && temp < 36.5)) {
    el.classList.add("warning");
  } else {
    el.classList.add("safe");
  }
}

function getHrRangeByAgeGender(age, gender) {
  const ranges = [
    { minAge: 0, maxAge: 0, male: { min: 102, max: 155 }, female: { min: 104, max: 156 } },
    { minAge: 1, maxAge: 1, male: { min: 95, max: 137 }, female: { min: 95, max: 139 } },
    { minAge: 2, maxAge: 3, male: { min: 85, max: 124 }, female: { min: 88, max: 125 } },
    { minAge: 4, maxAge: 5, male: { min: 74, max: 112 }, female: { min: 76, max: 117 } },
    { minAge: 6, maxAge: 8, male: { min: 66, max: 105 }, female: { min: 69, max: 106 } },
    { minAge: 9, maxAge: 11, male: { min: 61, max: 97 }, female: { min: 66, max: 103 } },
    { minAge: 12, maxAge: 15, male: { min: 57, max: 97 }, female: { min: 60, max: 99 } },
    { minAge: 16, maxAge: 19, male: { min: 52, max: 92 }, female: { min: 58, max: 99 } },
    { minAge: 20, maxAge: 39, male: { min: 52, max: 89 }, female: { min: 57, max: 95 } },
    { minAge: 40, maxAge: 59, male: { min: 52, max: 90 }, female: { min: 56, max: 92 } },
    { minAge: 60, maxAge: 79, male: { min: 50, max: 91 }, female: { min: 56, max: 92 } },
    { minAge: 80, maxAge: 200, male: { min: 51, max: 94 }, female: { min: 56, max: 93 } }
  ];

  const normalizedGender = String(gender || "").trim().toLowerCase();
  const isFemale =
    normalizedGender === "nữ" ||
    normalizedGender === "nu" ||
    normalizedGender === "female" ||
    normalizedGender === "f";

  const isMale =
    normalizedGender === "nam" ||
    normalizedGender === "male" ||
    normalizedGender === "m";

  const safeAge = Number(age);

  if (!Number.isFinite(safeAge) || safeAge < 0) {
    return { min: 60, max: 100 };
  }

  const matched = ranges.find(r => safeAge >= r.minAge && safeAge <= r.maxAge);

  if (!matched) {
    return { min: 60, max: 100 };
  }

  if (isFemale) return matched.female;
  if (isMale) return matched.male;

  return { min: 60, max: 100 };
}

function getCurrentPatientHrRange() {
  const ageInput = document.getElementById("infoAgeInput");
  const genderInput = document.getElementById("infoGenderInput");

  const age = Number(ageInput?.value);
  const gender = genderInput?.value || "";

  return getHrRangeByAgeGender(age, gender);
}

function applyHrColorByProfile(el, hr) {
  if (!el) return;

  el.classList.remove("safe", "warning", "danger");
  if (isNaN(hr)) return;

  const range = getCurrentPatientHrRange();
  const minHr = range.min;
  const maxHr = range.max;

  if (hr > (maxHr + 20) || hr < (minHr - 15)) {
    el.classList.add("danger");
  } else if (
    (hr > maxHr && hr <= (maxHr + 20)) ||
    (hr >= (minHr - 15) && hr < minHr)
  ) {
    el.classList.add("warning");
  } else {
    el.classList.add("safe");
  }
}

// ===== 1. HỆ THỐNG TAB & ĐIỀU HƯỚNG =====

function showTab(tabId) {
  document.querySelectorAll(".tab").forEach(tab => {
    tab.style.display = "none";
  });

  document.getElementById(tabId).style.display = "block";

  if (tabId === "analytics") {
    loadDailyData();
  }
}

function showMeasurementTab(tabId) {
  document.querySelectorAll(".measurement-tab").forEach(tab => {
    tab.style.display = "none";
  });

  document.getElementById(tabId).style.display = "block";
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
    if (label) {
      label.innerText = name;
    }

    const saveBtnLabel = document.getElementById("saveBtnLabel_" + currentPatientId);
    if (saveBtnLabel) {
      saveBtnLabel.innerText = name;
    }

    loadPatientInfo(currentPatientId, name);
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
    alert("Chưa có dữ liệu đo để lưu");
    return;
  }

  const spo2 = parseFloat(spo2Text);
  const temp = parseFloat(tempText);
  const heartRate = parseFloat(hrText);

  if (isNaN(spo2) || isNaN(temp) || isNaN(heartRate)) {
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
        spo2: spo2,
        temperature: temp,
        heart_rate: heartRate,
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
      loadPatientHistory();
      loadPatientInfo(patientId, patientName);
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

function resetPatientUI() {
  document.getElementById("spo2").innerText = "--";
  document.getElementById("temp").innerText = "--";
  document.getElementById("ecg").innerText = "--";

  if (document.getElementById("ai-status")) {
    document.getElementById("ai-status").innerText = "Chưa có kết quả";
    document.getElementById("ai-advice").innerText = "AI sẽ nhận xét sau khi bạn lưu kết quả đo cho bệnh nhân đã có tuổi và giới tính.";
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
    document.getElementById("infoAiStatus").innerText = "Chưa có dữ liệu";
    document.getElementById("infoAiAdvice").innerText = "Chưa có kết quả AI gần nhất.";
    document.getElementById("infoAiTime").innerText = "--:--:--";
  }
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

    document.getElementById("infoAiStatus").innerText = data.current_status || "--";
    document.getElementById("infoAiAdvice").innerText = data.advice || data.ai_prediction || "--";
    document.getElementById("infoAiTime").innerText = data.timestamp_ai || "--:--:--";
  });
}

// ===== 2. HỆ THỐNG DỰ BÁO AI =====

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

    const safeStatus = data.current_status || "--";
    const safeAdvice = data.advice || data.ai_prediction || "Chưa có lời khuyên từ AI.";
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
      if (data.status_code === 0) {
        statusBox.classList.add("ai-safe");
      } else if (data.status_code === 1) {
        statusBox.classList.add("ai-warning");
      } else if (data.status_code === 2) {
        statusBox.classList.add("ai-danger");
      }
    }
  });
}

// ===== 3. KHỞI TẠO BIỂU ĐỒ KHI TẢI TRANG =====

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

// ===== 4. MQTT CONFIGURATION & DATA PROCESSING =====

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
  const data = JSON.parse(message.toString());
  const dataPatientId = data.patientId || "patient_01";
  console.log("MQTT DATA:", data);

  const now = new Date();

  function pad2(n) {
    return String(n).padStart(2, "0");
  }

  const espTime = data.time;

  const timestamp = espTime
    ? `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}T${espTime}`
    : (data.timestamp || now.toISOString());

  const displayTime = espTime || now.toLocaleTimeString();

  const spo2 = parseFloat(data.spo2);
  const temp = parseFloat(data.temperature ?? data.temp);
  const heartRate = parseFloat(
    data.heart_rate ?? data.bpm ?? data.hr ?? data.heartRate
  );

  latestMeasurement = {
    timestamp: timestamp,
    spo2: isNaN(spo2) ? null : spo2,
    temperature: isNaN(temp) ? null : temp,
    heart_rate: isNaN(heartRate) ? null : heartRate
  };

  if (!isNaN(spo2) && !isNaN(temp) && !isNaN(heartRate)) {
    database.ref("healthData").push({
      timestamp: timestamp,
      spo2: spo2,
      temperature: temp,
      heart_rate: heartRate
    });
  }

  if (document.getElementById("liveSpo2")) {
    const liveSpo2El = document.getElementById("liveSpo2");
    const liveTempEl = document.getElementById("liveTemp");
    const liveHrEl = document.getElementById("liveHr");

    liveSpo2El.innerText = isNaN(spo2) ? "--" : spo2;
    liveTempEl.innerText = isNaN(temp) ? "--" : temp;
    liveHrEl.innerText = isNaN(heartRate) ? "--" : heartRate;
    document.getElementById("measureTime").innerText = displayTime;

    document.getElementById("saveSpo2").innerText = isNaN(spo2) ? "--" : spo2;
    document.getElementById("saveTemp").innerText = isNaN(temp) ? "--" : temp;
    document.getElementById("saveHr").innerText = isNaN(heartRate) ? "--" : heartRate;
    document.getElementById("saveTime").innerText = displayTime;

    applySpo2Color(liveSpo2El, spo2);
    applyTempColor(liveTempEl, temp);

    // ĐÃ SỬA CHỖ 1
    applyHrColorByProfile(liveHrEl, heartRate);
  }

  if (!currentPatientId || dataPatientId !== currentPatientId) {
    return;
  }

  const spo2El = document.getElementById("spo2");
  spo2El.innerText = isNaN(spo2) ? "--" : spo2;
  applySpo2Color(spo2El, spo2);

  const tempEl = document.getElementById("temp");
  tempEl.innerText = isNaN(temp) ? "--" : temp;
  applyTempColor(tempEl, temp);

  const hrEl = document.getElementById("ecg");
  hrEl.innerText = isNaN(heartRate) ? "--" : heartRate;

  // ĐÃ SỬA CHỖ 2
  applyHrColorByProfile(hrEl, heartRate);

  labels.push(displayTime);
  spo2Data.push(isNaN(spo2) ? null : spo2);
  tempData.push(isNaN(temp) ? null : temp);
  hrData.push(isNaN(heartRate) ? null : heartRate);

  if (labels.length > 20) {
    labels.shift();
    spo2Data.shift();
    tempData.shift();
    hrData.shift();
  }

  spo2Chart.update();
  tempChart.update();
  hrChart.update();
});

client.on("error", function(err) {
  console.log("MQTT Error:", err);
});

// ===== 5. LỊCH SỬ DỮ LIỆU =====

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
      const displayTime = new Date(item.timestamp).toLocaleString();
      labels.push(displayTime);
      spo2Data.push(Number(item.spo2));
      tempData.push(Number(item.temperature));
      hrData.push(Number(item.heart_rate));
    });

    const latest = records[records.length - 1];
    if (latest) {
      updateLatestPatient(latest);
    }

    records.slice().reverse().forEach(item => {
      const displayTime = new Date(item.timestamp).toLocaleString();
      const card = document.createElement("div");
      card.className = "card";
      card.innerHTML = `
        <p><strong>${displayTime}</strong></p>
        <p>SpO2: ${item.spo2}% | Temp: ${item.temperature}°C | Heart Rate: ${item.heart_rate} BPM</p>
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
  const temp = Number(item.temperature);
  const heartRate = Number(item.heart_rate);

  const spo2El = document.getElementById("spo2");
  const tempEl = document.getElementById("temp");
  const hrEl = document.getElementById("ecg");

  spo2El.innerText = isNaN(spo2) ? "--" : spo2;
  tempEl.innerText = isNaN(temp) ? "--" : temp;
  hrEl.innerText = isNaN(heartRate) ? "--" : heartRate;

  applySpo2Color(spo2El, spo2);
  applyTempColor(tempEl, temp);

  // ĐÃ SỬA CHỖ 3
  applyHrColorByProfile(hrEl, heartRate);
}

// ===== 6. PHÂN TÍCH DỮ LIỆU THEO NGÀY =====

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
      grouped[date].temp.push(Number(item.temperature));
      grouped[date].hr.push(Number(item.heart_rate));
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

function drawDailyChart(dates, spo2Data, tempData, hrData) {
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
          data: spo2Data,
          backgroundColor: "#66b3ff"
        },
        {
          label: "Avg Temperature",
          data: tempData,
          backgroundColor: "#ff9999"
        },
        {
          label: "Avg Heart Rate",
          data: hrData,
          backgroundColor: "#66ff99"
        }
      ]
    }
  });
}

// ===== 7. TÍCH HỢP XEM KẾT QUẢ ĐO =====
// Ưu tiên lấy bản đo mới nhất từ /healthData
// AI thì lấy thêm từ /alerts nếu có, nhưng không để ghi đè số đo

document.addEventListener("DOMContentLoaded", () => {
  const btnXemKetQua = document.getElementById("btn-xem-ket-qua");
  const ketQuaBox = document.getElementById("ket-qua-box");

  if (btnXemKetQua && ketQuaBox) {
    btnXemKetQua.addEventListener("click", async () => {
      btnXemKetQua.innerText = "Đang tải dữ liệu...";
      btnXemKetQua.disabled = true;

      try {
        if (!currentPatientId) {
          alert("Vui lòng chọn bệnh nhân trước");
          return;
        }

        // 1) Lấy lịch sử đo của bệnh nhân
        const healthSnapshot = await database
          .ref("patients/" + currentPatientId + "/healthData")
          .once("value");

        if (!healthSnapshot.exists()) {
          alert("Chưa có dữ liệu đo để hiển thị.");
          return;
        }

        const healthData = healthSnapshot.val();
        const records = Object.values(healthData).sort(
          (a, b) => new Date(a.timestamp) - new Date(b.timestamp)
        );

        const latestRecord = records[records.length - 1];

        // 2) Hiển thị số đo từ bản ghi mới nhất
        document.getElementById("val-hr").innerText =
          latestRecord?.heart_rate ?? "--";
        document.getElementById("val-temp").innerText =
          latestRecord?.temperature ?? "--";
        document.getElementById("val-spo2").innerText =
          latestRecord?.spo2 ?? "--";

        document.getElementById("val-time").innerText =
          latestRecord?.measure_time ||
          (latestRecord?.timestamp
            ? new Date(latestRecord.timestamp).toLocaleString()
            : "--:--:--");

        // 3) Lấy AI mới nhất từ /alerts nếu có
        const alertSnapshot = await database
          .ref("patients/" + currentPatientId + "/alerts")
          .once("value");

        if (alertSnapshot.exists()) {
          const alertData = alertSnapshot.val();

          document.getElementById("val-current-status").innerText =
            alertData.current_status || "--";

          document.getElementById("val-ai-advice").innerText =
            alertData.ai_prediction || alertData.advice || "--";

          const statusEl = document.getElementById("val-ai-advice");
          if (alertData.status_code === 2) {
            statusEl.style.color = "red";
          } else if (alertData.status_code === 1) {
            statusEl.style.color = "orange";
          } else {
            statusEl.style.color = "green";
          }
        } else {
          document.getElementById("val-current-status").innerText = "Chưa có";
          document.getElementById("val-ai-advice").innerText =
            "Chưa có kết quả AI cho lần đo này.";
          document.getElementById("val-ai-advice").style.color = "";
        }

        ketQuaBox.style.display = "block";
      } catch (error) {
        console.error("Lỗi khi tải dữ liệu:", error);
        alert("Lỗi kết nối đến cơ sở dữ liệu.");
      } finally {
        btnXemKetQua.innerText = "Xem kết quả đo";
        btnXemKetQua.disabled = false;
      }
    });
  }
});
