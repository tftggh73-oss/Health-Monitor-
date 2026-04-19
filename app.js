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

firebase.initializeApp(firebaseConfig);
const database = firebase.database();

// ===== BIẾN TOÀN CỤC =====
let dailyChart;
let currentPatientId = null;
let currentPatientName = "";
let patientListenerRef = null;
let aiListenerRef = null;
let latestMeasurement = null;

let labels = [];
let spo2Data = [];
let tempData = [];
let hrData = [];

let spo2Chart;
let tempChart;
let hrChart;

// ===== HÀM TIỆN ÍCH =====
function pad2(n) {
  return String(n).padStart(2, "0");
}

function normalizeGender(gender) {
  return String(gender || "").trim().toLowerCase();
}

function getCurrentPatientProfile() {
  return {
    age: Number(document.getElementById("infoAgeInput")?.value),
    gender: document.getElementById("infoGenderInput")?.value || ""
  };
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

  if (spo2 > 96) el.classList.add("safe");
  else if (spo2 >= 92) el.classList.add("warning");
  else el.classList.add("danger");
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

  const { min, max } = getHrRangeByAgeGender(age, gender);

  if (hr > (max + 20) || hr < (min - 15)) {
    el.classList.add("danger");
  } else if ((hr > max && hr <= (max + 20)) || (hr >= (min - 15) && hr < min)) {
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

function resetPatientUI() {
  const spo2El = document.getElementById("spo2");
  const tempEl = document.getElementById("temp");
  const hrEl = document.getElementById("ecg");

  if (spo2El) spo2El.innerText = "--";
  if (tempEl) tempEl.innerText = "--";
  if (hrEl) hrEl.innerText = "--";

  spo2El?.classList.remove("safe", "warning", "danger");
  tempEl?.classList.remove("safe", "warning", "danger");
  hrEl?.classList.remove("safe", "warning", "danger");

  const liveSpo2 = document.getElementById("liveSpo2");
  const liveTemp = document.getElementById("liveTemp");
  const liveHr = document.getElementById("liveHr");

  if (liveSpo2) liveSpo2.innerText = "--";
  if (liveTemp) liveTemp.innerText = "--";
  if (liveHr) liveHr.innerText = "--";

  liveSpo2?.classList.remove("safe", "warning", "danger");
  liveTemp?.classList.remove("safe", "warning", "danger");
  liveHr?.classList.remove("safe", "warning", "danger");

  const measureTime = document.getElementById("measureTime");
  const saveSpo2 = document.getElementById("saveSpo2");
  const saveTemp = document.getElementById("saveTemp");
  const saveHr = document.getElementById("saveHr");
  const saveTime = document.getElementById("saveTime");

  if (measureTime) measureTime.innerText = "--:--:--";
  if (saveSpo2) saveSpo2.innerText = "--";
  if (saveTemp) saveTemp.innerText = "--";
  if (saveHr) saveHr.innerText = "--";
  if (saveTime) saveTime.innerText = "--:--:--";

  const aiStatus = document.getElementById("ai-status");
  const aiAdvice = document.getElementById("ai-advice");
  const aiRisk = document.getElementById("ai-risk");
  const aiTime = document.getElementById("ai-time");
  const aiStatusBox = document.getElementById("ai-status-box");

  if (aiStatus) aiStatus.innerText = "Chưa có kết quả";
  if (aiAdvice) aiAdvice.innerText = "AI sẽ nhận xét sau khi bạn lưu kết quả đo cho bệnh nhân đã có tuổi và giới tính.";
  if (aiRisk) aiRisk.innerText = "0";
  if (aiTime) aiTime.innerText = "--:--:--";
  if (aiStatusBox) aiStatusBox.className = "";

  const measureAiStatus = document.getElementById("measureAiStatus");
  const measureAiAdvice = document.getElementById("measureAiAdvice");
  const measureRisk = document.getElementById("measureRisk");

  if (measureAiStatus) measureAiStatus.innerText = "Đang chờ dữ liệu...";
  if (measureAiAdvice) measureAiAdvice.innerText = "Vui lòng chờ dữ liệu...";
  if (measureRisk) measureRisk.innerText = "0";

  const infoAiStatus = document.getElementById("infoAiStatus");
  const infoAiAdvice = document.getElementById("infoAiAdvice");
  const infoAiTime = document.getElementById("infoAiTime");

  if (infoAiStatus) infoAiStatus.innerText = "Chưa có dữ liệu";
  if (infoAiAdvice) infoAiAdvice.innerText = "Chưa có kết quả AI gần nhất.";
  if (infoAiTime) infoAiTime.innerText = "--:--:--";

  const historyList = document.getElementById("historyList");
  if (historyList) historyList.innerHTML = "";

  const trendComment = document.getElementById("trendComment");
  if (trendComment) trendComment.innerText = "Đang phân tích dữ liệu...";

  resetChartsData();
}

// ===== ĐIỀU HƯỚNG =====
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
  latestMeasurement = null;

  document.getElementById("patientDashboard").style.display = "none";
  document.getElementById("measurementPage").style.display = "none";
  document.getElementById("patientListPage").style.display = "block";

  resetPatientUI();
}

// ===== THÔNG TIN BỆNH NHÂN =====
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
    name,
    age,
    gender
  })
  .then(() => {
    currentPatientName = name;
    document.getElementById("selectedPatientName").innerText = name;
    updatePatientLabelsUI(currentPatientId, name);
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

    const age = Number(document.getElementById("infoAgeInput")?.value);
    const gender = document.getElementById("infoGenderInput")?.value || "";

    const currentHr = Number(document.getElementById("ecg")?.innerText);
    if (!isNaN(currentHr)) {
      applyHrColorByProfile(document.getElementById("ecg"), currentHr, age, gender);
    }

    const liveHr = Number(document.getElementById("liveHr")?.innerText);
    if (!isNaN(liveHr)) {
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

// ===== LƯU KẾT QUẢ ĐO =====
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
  const measureTime = latestMeasurement.displayTime || "--:--:--";

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

// ===== AI LISTENER =====
function listenToAIAlerts(patientId) {
  if (aiListenerRef) aiListenerRef.off();

  aiListenerRef = database.ref("patients/" + patientId + "/alerts");

  aiListenerRef.on("value", (snapshot) => {
    const data = snapshot.val();
    if (!data) return;

    const safeStatus = data.current_status || "--";
    const safeAdvice = data.advice || data.ai_prediction || "Chưa có lời khuyên từ AI.";
    const safeTime = data.timestamp_ai || "--:--:--";
    const safeRisk = Math.round((data.risk_score || 0) * 100);

    const aiStatus = document.getElementById("ai-status");
    const aiAdvice = document.getElementById("ai-advice");
    const aiTime = document.getElementById("ai-time");
    const aiRisk = document.getElementById("ai-risk");
    const aiStatusBox = document.getElementById("ai-status-box");

    if (aiStatus) aiStatus.innerText = safeStatus;
    if (aiAdvice) aiAdvice.innerText = safeAdvice;
    if (aiTime) aiTime.innerText = safeTime;
    if (aiRisk) aiRisk.innerText = safeRisk;

    const measureAiStatus = document.getElementById("measureAiStatus");
    const measureAiAdvice = document.getElementById("measureAiAdvice");
    const measureRisk = document.getElementById("measureRisk");

    if (measureAiStatus) measureAiStatus.innerText = safeStatus;
    if (measureAiAdvice) measureAiAdvice.innerText = safeAdvice;
    if (measureRisk) measureRisk.innerText = safeRisk;

    const infoAiStatus = document.getElementById("infoAiStatus");
    const infoAiAdvice = document.getElementById("infoAiAdvice");
    const infoAiTime = document.getElementById("infoAiTime");

    if (infoAiStatus) infoAiStatus.innerText = safeStatus;
    if (infoAiAdvice) infoAiAdvice.innerText = safeAdvice;
    if (infoAiTime) infoAiTime.innerText = safeTime;

    if (aiStatusBox) {
      aiStatusBox.classList.remove("ai-safe", "ai-warning", "ai-danger");
      if (data.status_code === 0) aiStatusBox.classList.add("ai-safe");
      else if (data.status_code === 1) aiStatusBox.classList.add("ai-warning");
      else if (data.status_code === 2) aiStatusBox.classList.add("ai-danger");
    }
  });
}

// ===== CHART INIT =====
window.onload = function() {
  const spo2Canvas = document.getElementById("spo2Chart");
  const tempCanvas = document.getElementById("tempChart");
  const hrCanvas = document.getElementById("hrChart");

  if (spo2Canvas) {
    spo2Chart = new Chart(spo2Canvas.getContext("2d"), {
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
  }

  if (tempCanvas) {
    tempChart = new Chart(tempCanvas.getContext("2d"), {
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
  }

  if (hrCanvas) {
    hrChart = new Chart(hrCanvas.getContext("2d"), {
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
  }

  loadPatientLabels();
};

// ===== MQTT =====
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
  const heartRate = parseFloat(data.heart_rate ?? data.bpm ?? data.hr ?? data.heartRate);

  latestMeasurement = {
    patientId: dataPatientId,
    timestamp: timestamp,
    displayTime: displayTime,
    spo2: isNaN(spo2) ? null : spo2,
    temperature: isNaN(temp) ? null : temp,
    heart_rate: isNaN(heartRate) ? null : heartRate
  };

  if (!isNaN(spo2) && !isNaN(temp) && !isNaN(heartRate)) {
    database.ref("healthData").push({
      timestamp: timestamp,
      spo2: spo2,
      temperature: temp,
      heart_rate: heartRate,
      patientId: dataPatientId
    });
  }

  if (!currentPatientId || dataPatientId !== currentPatientId) {
    return;
  }

  const { age, gender } = getCurrentPatientProfile();

  const liveSpo2El = document.getElementById("liveSpo2");
  const liveTempEl = document.getElementById("liveTemp");
  const liveHrEl = document.getElementById("liveHr");

  if (liveSpo2El) liveSpo2El.innerText = isNaN(spo2) ? "--" : spo2;
  if (liveTempEl) liveTempEl.innerText = isNaN(temp) ? "--" : temp;
  if (liveHrEl) liveHrEl.innerText = isNaN(heartRate) ? "--" : heartRate;

  const measureTime = document.getElementById("measureTime");
  if (measureTime) measureTime.innerText = displayTime;

  const saveSpo2 = document.getElementById("saveSpo2");
  const saveTemp = document.getElementById("saveTemp");
  const saveHr = document.getElementById("saveHr");
  const saveTime = document.getElementById("saveTime");

  if (saveSpo2) saveSpo2.innerText = isNaN(spo2) ? "--" : spo2;
  if (saveTemp) saveTemp.innerText = isNaN(temp) ? "--" : temp;
  if (saveHr) saveHr.innerText = isNaN(heartRate) ? "--" : heartRate;
  if (saveTime) saveTime.innerText = displayTime;

  applySpo2Color(liveSpo2El, spo2);
  applyTempColor(liveTempEl, temp);
  applyHrColorByProfile(liveHrEl, heartRate, age, gender);

  const spo2El = document.getElementById("spo2");
  const tempEl = document.getElementById("temp");
  const hrEl = document.getElementById("ecg");

  if (spo2El) spo2El.innerText = isNaN(spo2) ? "--" : spo2;
  if (tempEl) tempEl.innerText = isNaN(temp) ? "--" : temp;
  if (hrEl) hrEl.innerText = isNaN(heartRate) ? "--" : heartRate;

  applySpo2Color(spo2El, spo2);
  applyTempColor(tempEl, temp);
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

  spo2Chart?.update();
  tempChart?.update();
  hrChart?.update();
});

client.on("error", function(err) {
  console.log("MQTT Error:", err);
});

// ===== LỊCH SỬ =====
function loadPatientHistory() {
  if (!currentPatientId) return;

  if (patientListenerRef) {
    patientListenerRef.off();
  }

  patientListenerRef = database.ref("patients/" + currentPatientId + "/healthData");

  patientListenerRef.on("value", function(snapshot) {
    const data = snapshot.val();
    const historyList = document.getElementById("historyList");
    if (historyList) historyList.innerHTML = "";

    labels.length = 0;
    spo2Data.length = 0;
    tempData.length = 0;
    hrData.length = 0;

    if (!data) {
      spo2Chart?.update();
      tempChart?.update();
      hrChart?.update();
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
      historyList?.appendChild(card);
    });

    spo2Chart?.update();
    tempChart?.update();
    hrChart?.update();
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

  if (spo2El) spo2El.innerText = isNaN(spo2) ? "--" : spo2;
  if (tempEl) tempEl.innerText = isNaN(temp) ? "--" : temp;
  if (hrEl) hrEl.innerText = isNaN(heartRate) ? "--" : heartRate;

  applySpo2Color(spo2El, spo2);
  applyTempColor(tempEl, temp);
  applyHrColorByProfile(hrEl, heartRate, age, gender);
}

// ===== PHÂN TÍCH =====
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

      avgSpo2.push(Number((spo2Arr.reduce((a, b) => a + b, 0) / spo2Arr.length).toFixed(1)));
      avgTemp.push(Number((tempArr.reduce((a, b) => a + b, 0) / tempArr.length).toFixed(1)));
      avgHR.push(Number((hrArr.reduce((a, b) => a + b, 0) / hrArr.length).toFixed(1)));
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

  const spo2Text = spo2Last > spo2First ? "SpO2 có xu hướng tăng" :
                   spo2Last < spo2First ? "SpO2 có xu hướng giảm" :
                   "SpO2 tương đối ổn định";

  const tempText = tempLast > tempFirst ? "nhiệt độ có xu hướng tăng" :
                   tempLast < tempFirst ? "nhiệt độ có xu hướng giảm" :
                   "nhiệt độ tương đối ổn định";

  const hrText = hrLast > hrFirst ? "nhịp tim có xu hướng tăng" :
                 hrLast < hrFirst ? "nhịp tim có xu hướng giảm" :
                 "nhịp tim tương đối ổn định";

  trendEl.innerText = `${spo2Text}, ${tempText}, ${hrText} trong những lần đo gần đây.`;
}

function drawDailyChart(dates, spo2Arr, tempArr, hrArr) {
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
          data: spo2Arr,
          backgroundColor: "#66b3ff"
        },
        {
          label: "Avg Temperature",
          data: tempArr,
          backgroundColor: "#ff9999"
        },
        {
          label: "Avg Heart Rate",
          data: hrArr,
          backgroundColor: "#66ff99"
        }
      ]
    }
  });
}
