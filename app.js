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

// Dữ liệu cho biểu đồ realtime
let labels = [];
let spo2Data = [];
let tempData = [];
let hrData = [];

let spo2Chart;
let tempChart;
let hrChart;

// ===== HÀM DÙNG CHUNG =====
function pad2(n) {
  return String(n).padStart(2, "0");
}

function normalizeGender(gender) {
  return String(gender || "").trim().toLowerCase();
}

function getCurrentPatientProfile() {
  const age = Number(document.getElementById("infoAgeInput")?.value);
  const gender = document.getElementById("infoGenderInput")?.value || "";
  return { age, gender };
}

function getHrRangeByAgeGender(age, gender) {
  const g = normalizeGender(gender);
  const isMale = ["nam", "male", "m", "1"].includes(g);

  if (!Number.isFinite(age) || age < 0) {
    return { min: 60, max: 100 };
  }

  if (age < 1) return isMale ? { min: 102, max: 155 } : { min: 104, max: 156 };
  if (age === 1) return isMale ? { min: 95, max: 137 } : { min: 95, max: 139 };
  if (age <= 3) return isMale ? { min: 85, max: 124 } : { min: 88, max: 125 };
  if (age <= 5) return isMale ? { min: 74, max: 112 } : { min: 76, max: 117 };
  if (age <= 8) return isMale ? { min: 66, max: 105 } : { min: 69, max: 106 };
  if (age <= 11) return isMale ? { min: 61, max: 97 } : { min: 66, max: 103 };
  if (age <= 15) return isMale ? { min: 57, max: 97 } : { min: 60, max: 99 };
  if (age <= 19) return isMale ? { min: 52, max: 92 } : { min: 58, max: 99 };
  if (age <= 39) return isMale ? { min: 52, max: 89 } : { min: 57, max: 95 };
  if (age <= 59) return isMale ? { min: 52, max: 90 } : { min: 56, max: 92 };
  if (age <= 79) return isMale ? { min: 50, max: 91 } : { min: 56, max: 92 };
  return isMale ? { min: 51, max: 94 } : { min: 56, max: 93 };
}

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

function applyHrColorByProfile(el, hr, age, gender) {
  if (!el) return;
  el.classList.remove("safe", "warning", "danger");
  if (isNaN(hr)) return;

  const range = getHrRangeByAgeGender(age, gender);
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

function updatePatientLabelsUI(patientId, name) {
  const label = document.getElementById("patientLabel_" + patientId);
  if (label) label.innerText = name;

  const saveBtnLabel = document.getElementById("saveBtnLabel_" + patientId);
  if (saveBtnLabel) saveBtnLabel.innerText = name;
}

function resetChartsData() {
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
}

function resetAiUI() {
  if (document.getElementById("ai-status")) {
    document.getElementById("ai-status").innerText = "Chưa có kết quả";
    document.getElementById("ai-advice").innerText = "AI sẽ nhận xét sau khi bạn lưu kết quả đo cho bệnh nhân đã có tuổi và giới tính.";
    document.getElementById("ai-risk").innerText = "0";
    document.getElementById("ai-time").innerText = "--:--:--";
    document.getElementById("ai-status-box").className = "";
  }

  if (document.getElementById("infoAiStatus")) {
    document.getElementById("infoAiStatus").innerText = "Chưa có dữ liệu";
    document.getElementById("infoAiAdvice").innerText = "Chưa có kết quả AI gần nhất.";
    document.getElementById("infoAiTime").innerText = "--:--:--";
  }
}

function resetLiveUI() {
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
}

function resetPatientInfoUI() {
  if (document.getElementById("infoNameInput")) {
    document.getElementById("infoNameInput").value = "";
    document.getElementById("infoAgeInput").value = "";
    document.getElementById("infoGenderInput").value = "";
  }
}

function resetPatientDashboardUI() {
  document.getElementById("spo2").innerText = "--";
  document.getElementById("temp").innerText = "--";
  document.getElementById("ecg").innerText = "--";

  document.getElementById("spo2").classList.remove("safe", "warning", "danger");
  document.getElementById("temp").classList.remove("safe", "warning", "danger");
  document.getElementById("ecg").classList.remove("safe", "warning", "danger");

  document.getElementById("historyList").innerHTML = "";

  if (document.getElementById("trendComment")) {
    document.getElementById("trendComment").innerText = "Đang phân tích dữ liệu...";
  }
}

function resetPatientUI() {
  resetPatientDashboardUI();
  resetAiUI();
  resetChartsData();
  resetLiveUI();
  resetPatientInfoUI();
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
  latestMeasurement = null;

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
    updatePatientLabelsUI(currentPatientId, name);
    loadPatientInfo(currentPatientId, name);

    if (!isNaN(Number(document.getElementById("liveHr")?.innerText))) {
      const hr = Number(document.getElementById("liveHr").innerText);
      applyHrColorByProfile(document.getElementById("liveHr"), hr, age, gender);
    }

    if (!isNaN(Number(document.getElementById("ecg")?.innerText))) {
      const hr = Number(document.getElementById("ecg").innerText);
      applyHrColorByProfile(document.getElementById("ecg"), hr, age, gender);
    }

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
      if (savedName) {
        updatePatientLabelsUI(patientId, savedName);
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

    const currentHr = Number(document.getElementById("ecg")?.innerText);
    if (!isNaN(currentHr)) {
      const age = Number(document.getElementById("infoAgeInput")?.value);
      const gender = document.getElementById("infoGenderInput")?.value || "";
      applyHrColorByProfile(document.getElementById("ecg"), currentHr, age, gender);
    }

    const liveHr = Number(document.getElementById("liveHr")?.innerText);
    if (!isNaN(liveHr)) {
      const age = Number(document.getElementById("infoAgeInput")?.value);
      const gender = document.getElementById("infoGenderInput")?.value || "";
      applyHrColorByProfile(document.getElementById("liveHr"), liveHr, age, gender);
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

// ===== 3. LƯU KẾT QUẢ ĐO CHO BỆNH NHÂN =====
function saveResultForPatient(patientId, patientName) {
  if (!patientId) {
    alert("Chưa chọn bệnh nhân");
    return;
  }

  if (!latestMeasurement) {
    alert("Chưa có dữ liệu đo để lưu");
    return;
  }

  if (latestMeasurement.patientId !== patientId) {
    alert("Dữ liệu đo hiện tại không thuộc bệnh nhân đang chọn");
    return;
  }

  const spo2 = Number(latestMeasurement.spo2);
  const temp = Number(latestMeasurement.temperature);
  const heartRate = Number(latestMeasurement.heart_rate);
  const measureTime = latestMeasurement.displayTime || document.getElementById("measureTime")?.innerText || "--:--:--";

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
      const recordTimestamp = latestMeasurement.timestamp || now.toISOString();

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

// ===== 4. AI ALERTS =====
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

// ===== 5. KHỞI TẠO BIỂU ĐỒ =====
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

// ===== 6. MQTT CONFIGURATION & DATA PROCESSING =====
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
    patientId: dataPatientId,
    timestamp: timestamp,
    displayTime: displayTime,
    spo2: isNaN(spo2) ? null : spo2,
    temperature: isNaN(temp) ? null : temp,
    heart_rate: isNaN(heartRate) ? null : heartRate
  };

  // Gửi dữ liệu thô lên nhánh /healthData để AI duy trì buffer realtime
  if (!isNaN(spo2) && !isNaN(temp) && !isNaN(heartRate)) {
    database.ref("healthData").push({
      timestamp: timestamp,
      spo2: spo2,
      temperature: temp,
      heart_rate: heartRate,
      patientId: dataPatientId
    });
  }

  // Chỉ cập nhật UI khi đúng bệnh nhân đang chọn
  if (!currentPatientId || dataPatientId !== currentPatientId) {
    return;
  }

  const profile = getCurrentPatientProfile();
  const age = profile.age;
  const gender = profile.gender;

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
    applyHrColorByProfile(liveHrEl, heartRate, age, gender);
  }

  const spo2El = document.getElementById("spo2");
  spo2El.innerText = isNaN(spo2) ? "--" : spo2;
  applySpo2Color(spo2El, spo2);

  const tempEl = document.getElementById("temp");
  tempEl.innerText = isNaN(temp) ? "--" : temp;
  applyTempColor(tempEl, temp);

  const hrEl = document.getElementById("ecg");
  hrEl.innerText = isNaN(heartRate) ? "--" : heartRate;
  applyHrColorByProfile(hrEl, heartRate, age, gender);

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

// ===== 7. LỊCH SỬ DỮ LIỆU =====
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
  const age = Number(item.age ?? document.getElementById("infoAgeInput")?.value);
  const gender = item.gender || document.getElementById("infoGenderInput")?.value || "";

  const spo2El = document.getElementById("spo2");
  const tempEl = document.getElementById("temp");
  const hrEl = document.getElementById("ecg");

  spo2El.innerText = isNaN(spo2) ? "--" : spo2;
  tempEl.innerText = isNaN(temp) ? "--" : temp;
  hrEl.innerText = isNaN(heartRate) ? "--" : heartRate;

  applySpo2Color(spo2El, spo2);
  applyTempColor(tempEl, temp);
  applyHrColorByProfile(hrEl, heartRate, age, gender);
}

// ===== 8. PHÂN TÍCH DỮ LIỆU THEO NGÀY =====
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

// ===== 9. XEM KẾT QUẢ ĐO + AI =====
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

        document.getElementById("val-hr").innerText = latestRecord?.heart_rate ?? "--";
        document.getElementById("val-temp").innerText = latestRecord?.temperature ?? "--";
        document.getElementById("val-spo2").innerText = latestRecord?.spo2 ?? "--";
        document.getElementById("val-time").innerText =
          latestRecord?.measure_time ||
          (latestRecord?.timestamp ? new Date(latestRecord.timestamp).toLocaleString() : "--:--:--");

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
          document.getElementById("val-ai-advice").innerText = "Chưa có kết quả AI.";
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
