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

// Dữ liệu cho biểu đồ Realtime
let labels = [];
let spo2Data = [];
let tempData = [];
let hrData = [];

let spo2Chart;
let tempChart;
let hrChart;

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

function selectPatient(patientId, patientName) {
  currentPatientId = patientId;
  currentPatientName = patientName;

  document.getElementById("patientListPage").style.display = "none";
  document.getElementById("patientDashboard").style.display = "block";

  document.getElementById("selectedPatientName").innerText = patientName;
  document.getElementById("selectedPatientId").innerText = "Mã bệnh nhân: " + patientId;

  resetPatientUI();
  showTab("live");
  loadPatientHistory();


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

 function savePatientInfo() {
  if (!currentPatientId) {
    alert("Chưa chọn bệnh nhân");
    return;
  }

  const name = document.getElementById("infoNameInput").value.trim();
  const age = document.getElementById("infoAgeInput").value.trim();
  const gender = document.getElementById("infoGenderInput").value;

  if (!name) {
    alert("Vui lòng nhập họ tên");
    return;
  }

  database.ref("patients/" + currentPatientId + "/profile").set({
    name: name,
    age: age,
    gender: gender
  })
  .then(() => {
    currentPatientName = name;

    // cập nhật tên trên đầu dashboard
    document.getElementById("selectedPatientName").innerText = name;

    // cập nhật tên ngoài sảnh
    const label = document.getElementById("patientLabel_" + currentPatientId);
    if (label) {
      label.innerText = name;
    }

    alert("Đã lưu thông tin bệnh nhân");
  })
  .catch((error) => {
    console.error("Lỗi lưu thông tin:", error);
    alert("Lưu thất bại");
  });
} 
function showMeasurementTab(tabId) {
  document.querySelectorAll(".measurement-tab").forEach(tab => {
    tab.style.display = "none";
  });

  document.getElementById(tabId).style.display = "block";
}

function saveResultForPatient(patientId, patientName) {
  const spo2 = document.getElementById("liveSpo2").innerText;
  const temp = document.getElementById("liveTemp").innerText;
  const hrText = document.getElementById("liveHr").innerText;
  const time = document.getElementById("measureTime").innerText;

  const hr = parseFloat(hrText);

  if (spo2 === "--" || temp === "--" || hrText === "--") {
    alert("Chưa có dữ liệu để lưu");
    return;
  }

  database.ref("patients/" + patientId + "/healthData").push({
    timestamp: new Date().toISOString(),
    spo2: parseFloat(spo2),
    temperature: parseFloat(temp),
    heart_rate: isNaN(hr) ? hrText : hr
  })
  .then(() => {
    alert("Đã lưu kết quả cho " + patientName);
  })
  .catch((error) => {
    console.error("Lỗi lưu dữ liệu:", error);
    alert("Lưu thất bại");
  });
}
  // Kích hoạt lắng nghe dự báo AI cho bệnh nhân này
  loadPatientInfo(patientId, patientName);
  listenToAIAlerts(patientId);
}

function goBack() {
  // Tắt các lắng nghe Firebase cũ để tránh tốn tài nguyên và sai lệch dữ liệu
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
  document.getElementById("patientListPage").style.display = "block";

  resetPatientUI();
}

function resetPatientUI() {
  // Reset các chỉ số text
  document.getElementById("spo2").innerText = "--";
  document.getElementById("temp").innerText = "--";
  document.getElementById("ecg").innerText = "--";
  
  // Reset khu vực hiển thị AI
  if(document.getElementById("ai-status")) {
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

  // Xóa mảng dữ liệu biểu đồ
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
    // Reset giao diện trang kết quả đo hiện tại
  if (document.getElementById("liveSpo2")) {
    document.getElementById("liveSpo2").innerText = "--";
    document.getElementById("liveTemp").innerText = "--";
    document.getElementById("liveHr").innerText = "--";
    document.getElementById("measureTime").innerText = "--:--:--";
    document.getElementById("saveSpo2").innerText = "--";
    document.getElementById("saveTemp").innerText = "--";
    document.getElementById("saveHr").innerText = "--";
    document.getElementById("saveTime").innerText = "--:--:--";
  }
  if (document.getElementById("infoName")) {
  document.getElementById("infoName").innerText = "--";
  document.getElementById("infoAge").innerText = "--";
  document.getElementById("infoGender").innerText = "--";
  document.getElementById("infoAiStatus").innerText = "Đang chờ dữ liệu...";
  document.getElementById("infoAiAdvice").innerText = "Chưa có dữ liệu AI.";
  document.getElementById("infoAiTime").innerText = "--:--:--";
}
}

function loadPatientInfo(patientId, patientName) {
  document.getElementById("infoName").innerText = patientName;

  // Có thể đổi tay theo từng bệnh nhân nếu chưa lưu info trên Firebase
  const patientMap = {
    bn01: { age: 65, gender: "Nam" },
    bn02: { age: 58, gender: "Nữ" },
    bn03: { age: 72, gender: "Nam" },
    bn04: { age: 60, gender: "Nữ" },
    bn05: { age: 67, gender: "Nam" }
  };

  const info = patientMap[patientId] || { age: "--", gender: "--" };

  document.getElementById("infoAge").innerText = info.age;
  document.getElementById("infoGender").innerText = info.gender;

  database.ref("patients/" + patientId + "/alerts").once("value", function(snapshot) {
    const data = snapshot.val();

    if (!data) {
      document.getElementById("infoAiStatus").innerText = "Chưa có dữ liệu";
      document.getElementById("infoAiAdvice").innerText = "Chưa có kết quả AI gần nhất.";
      document.getElementById("infoAiTime").innerText = "--:--:--";
      return;
    }

    document.getElementById("infoAiStatus").innerText = data.status || "--";
    document.getElementById("infoAiAdvice").innerText = data.advice || "--";
    document.getElementById("infoAiTime").innerText = data.timestamp_ai || "--:--:--";
  });
}
// ===== 2. HỆ THỐNG DỰ BÁO AI =====

function listenToAIAlerts(patientId) {
    // Nếu có listener cũ thì tắt đi trước
    if (aiListenerRef) aiListenerRef.off();

    aiListenerRef = database.ref("patients/" + patientId + "/alerts");
    
    aiListenerRef.on("value", (snapshot) => {
        const data = snapshot.val();
        if (!data) return;

        // Cập nhật các trường thông tin AI lên giao diện
        const statusEl = document.getElementById("ai-status");
        const adviceEl = document.getElementById("ai-advice");
        const timeEl = document.getElementById("ai-time");
        const riskEl = document.getElementById("ai-risk");
        const statusBox = document.getElementById("ai-status-box");

        if(statusEl) statusEl.innerText = data.status;
        if(adviceEl) adviceEl.innerText = data.advice;
        if(timeEl) timeEl.innerText = data.timestamp_ai;
        if(riskEl) riskEl.innerText = Math.round(data.risk_score * 100);

        // Thay đổi màu sắc khung cảnh báo AI
        if(statusBox) {
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
  const dataPatientId = data.patientId || "bn01";
  console.log("MQTT DATA:", data);

  const timestamp = new Date().toISOString();
  const displayTime = new Date().toLocaleString();

  // Đọc dữ liệu số
  const spo2 = parseFloat(data.spo2);
  const temp = parseFloat(data.temperature);
  const heartRate = parseFloat(
    data.heart_rate ?? data.bpm ?? data.hr ?? data.heartRate
  );

  // Cập nhật giao diện trang "Xem kết quả đo"
if (document.getElementById("liveSpo2")) {
  document.getElementById("liveSpo2").innerText = isNaN(spo2) ? "--" : spo2;
  document.getElementById("liveTemp").innerText = isNaN(temp) ? "--" : temp;
  document.getElementById("liveHr").innerText = isNaN(heartRate) ? "--" : heartRate;
  document.getElementById("measureTime").innerText = displayTime;

  document.getElementById("saveSpo2").innerText = isNaN(spo2) ? "--" : spo2;
  document.getElementById("saveTemp").innerText = isNaN(temp) ? "--" : temp;
  document.getElementById("saveHr").innerText = isNaN(heartRate) ? "--" : heartRate;
  document.getElementById("saveTime").innerText = displayTime;
}
  // LƯU VÀO FIREBASE
  if (!isNaN(spo2) && !isNaN(temp) && !isNaN(heartRate)) {
    database.ref("patients/" + dataPatientId + "/healthData").push({
      timestamp: timestamp,
      spo2: spo2,
      temperature: temp,
      heart_rate: heartRate
    });
  }

  // Cập nhật giao diện nếu đang xem đúng bệnh nhân
  if (!currentPatientId || dataPatientId !== currentPatientId) {
    return;
  }

  // Cập nhật hiển thị số & màu sắc SpO2
  const spo2El = document.getElementById("spo2");
  spo2El.innerText = isNaN(spo2) ? "--" : spo2;
  spo2El.classList.remove("safe", "warning", "danger");
  if (!isNaN(spo2)) {
    if (spo2 >= 95) spo2El.classList.add("safe");
    else if (spo2 >= 92) spo2El.classList.add("warning");
    else spo2El.classList.add("danger");
  }

  // Cập nhật hiển thị số & màu sắc Nhiệt độ
  const tempEl = document.getElementById("temp");
  tempEl.innerText = isNaN(temp) ? "--" : temp;
  tempEl.classList.remove("safe", "warning", "danger");
  if (!isNaN(temp)) {
    if (temp < 37.5) tempEl.classList.add("safe");
    else if (temp <= 37.8) tempEl.classList.add("warning");
    else tempEl.classList.add("danger");
  }

  // Cập nhật hiển thị số & màu sắc Nhịp tim
  const hrEl = document.getElementById("ecg");
  hrEl.innerText = isNaN(heartRate) ? "--" : heartRate + " BPM";
  hrEl.classList.remove("safe", "warning", "danger");
  if (!isNaN(heartRate)) {
    if (heartRate >= 60 && heartRate <= 100) hrEl.classList.add("safe");
    else if (heartRate >= 50 && heartRate <= 120) hrEl.classList.add("warning");
    else hrEl.classList.add("danger");
  }

  // Cập nhật biểu đồ Realtime (giới hạn 20 điểm dữ liệu)
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

    // Lấy 20 bản ghi cuối cho biểu đồ
    const latest20 = records.slice(-20);
    latest20.forEach(item => {
      const displayTime = new Date(item.timestamp).toLocaleString();
      labels.push(displayTime);
      spo2Data.push(Number(item.spo2));
      tempData.push(Number(item.temperature));
      hrData.push(Number(item.heart_rate));
    });

    // Cập nhật giá trị hiển thị lớn (Latest)
    const latest = records[records.length - 1];
    if (latest) {
      updateLatestPatient(latest);
    }

    // Hiển thị danh sách card lịch sử (mới nhất lên đầu)
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
  hrEl.innerText = isNaN(heartRate) ? "--" : heartRate + " BPM";

  spo2El.classList.remove("safe", "warning", "danger");
  tempEl.classList.remove("safe", "warning", "danger");
  hrEl.classList.remove("safe", "warning", "danger");

  if (!isNaN(spo2)) {
    if (spo2 >= 95) spo2El.classList.add("safe");
    else if (spo2 >= 92) spo2El.classList.add("warning");
    else spo2El.classList.add("danger");
  }

  if (!isNaN(temp)) {
    if (temp < 37.5) tempEl.classList.add("safe");
    else if (temp <= 37.8) tempEl.classList.add("warning");
    else tempEl.classList.add("danger");
  }

  if (!isNaN(heartRate)) {
    if (heartRate >= 60 && heartRate <= 100) hrEl.classList.add("safe");
    else if (heartRate >= 50 && heartRate <= 120) hrEl.classList.add("warning");
    else hrEl.classList.add("danger");
  }
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

    // Lấy dữ liệu của 3 ngày gần nhất
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
  });
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
