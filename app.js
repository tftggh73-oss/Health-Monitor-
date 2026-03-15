// ===== FIREBASE =====
const firebaseConfig = {
  apiKey: "AIzaSyBM8QrJvGrk1r3UVeJB05e3YHVsuinwQ_M",
  authDomain: "health-monitor-iot-7b603.firebaseapp.com",
  databaseURL: "https://health-monitor-iot-7b603-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "health-monitor-iot-7b603",
  storageBucket: "health-monitor-iot-7b603.firebasestorage.app",
  messagingSenderId: "291381979405",
  appId: "1:291381979405:web:1ce0164f2dfc721b032844"
};
let dailyChart; 
firebase.initializeApp(firebaseConfig);
const database = firebase.database();
// ===== TAB SWITCH =====
function showTab(tabId) {
  document.querySelectorAll(".tab").forEach(tab => {
    tab.style.display = "none";
  });

  document.getElementById(tabId).style.display = "block";

  if (tabId === "analytics") {
    loadDailyData();
  }
}

// ===== DATA STORAGE =====
let labels = [];
let spo2Data = [];
let tempData = [];

let spo2Chart;
let tempChart;

// ===== CREATE CHART AFTER PAGE LOAD =====
window.onload = function () {

  const spo2Ctx = document.getElementById("spo2Chart").getContext("2d");
  const tempCtx = document.getElementById("tempChart").getContext("2d");

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
};

// ===== MQTT CONFIG =====
const host = "wss://c5c491454563470fad86602d8132fcab.s1.eu.hivemq.cloud:8884/mqtt";

const options = {
  username: "device01",
  password: "Device2026"
};

const client = mqtt.connect(host, options);

// ===== CONNECT =====
client.on("connect", function () {
  console.log("MQTT Connected");
  client.subscribe("health/device01/data");
});

// ===== RECEIVE DATA =====
client.on("message", function (topic, message) {

  const data = JSON.parse(message.toString());
  const nowStr = new Date().toISOString().replace("T", " ").substring(0, 19); // "YYYY-MM-DD HH:MM:SS"
const time = data.timestamp ? String(data.timestamp) : nowStr;

  // ===== SpO2 =====
  const spo2El = document.getElementById("spo2");
  const spo2 = parseFloat(String(data.spo2).replace(/[^\d.]/g, ""));
  spo2El.innerText = isNaN(spo2) ? "--" : spo2;
  spo2El.classList.remove("safe", "warning", "danger");

  if (!isNaN(spo2)) {
    if (spo2 >= 95) spo2El.classList.add("safe");
    else if (spo2 >= 92) spo2El.classList.add("warning");
    else spo2El.classList.add("danger");
  }

  // ===== Temperature =====
  const tempEl = document.getElementById("temp");
  const temp = parseFloat(String(data.temperature).replace(/[^\d.]/g, ""));
  tempEl.innerText = isNaN(temp) ? "--" : temp;
  tempEl.classList.remove("safe", "warning", "danger");

  if (!isNaN(temp)) {
    if (temp < 37.5) tempEl.classList.add("safe");
    else if (temp <= 37.8) tempEl.classList.add("warning");
    else tempEl.classList.add("danger");
  }

  // ===== ECG =====
  const ecgEl = document.getElementById("ecg");
  ecgEl.innerText = data.ecg_quality;
  ecgEl.classList.remove("safe", "warning", "danger");

  if (data.ecg_quality === "good") ecgEl.classList.add("safe");
  else if (data.ecg_quality === "noise") ecgEl.classList.add("warning");
  else ecgEl.classList.add("danger");

  // 🔥 ===== LƯU FIREBASE =====
  if (!isNaN(spo2) && !isNaN(temp)) {
    database.ref("healthData").push({
      timestamp: time,
      spo2: spo2,
      temperature: temp,
      ecg_quality: data.ecg_quality
    });
  }

  // ===== History =====
  const historyList = document.getElementById("historyList");
  const item = document.createElement("div");
  item.className = "card";
  item.innerHTML = `
    <p><strong>${time}</strong></p>
    <p>SpO2: ${spo2}% | Temp: ${temp}°C | ECG: ${data.ecg_quality}</p>
  `;
  historyList.prepend(item);

  // ===== UPDATE CHART =====
  labels.push(time);
  spo2Data.push(spo2);
  tempData.push(temp);

  if (labels.length > 20) {
    labels.shift();
    spo2Data.shift();
    tempData.shift();
  }

  spo2Chart.update();
  tempChart.update();
});
  

client.on("error", function (err) {
  console.log("MQTT Error:", err);
});
function loadDailyData() {

  database.ref("healthData").on("value", function(snapshot) {

    const data = snapshot.val();
    if (!data) return;

    const grouped = {};

    Object.values(data).forEach(item => {

      const date = item.timestamp.substring(0, 10);

      if (!grouped[date]) {
        grouped[date] = { spo2: [], temp: [] };
      }

      grouped[date].spo2.push(Number(item.spo2));
      grouped[date].temp.push(Number(item.temperature));
    });

    const dates = Object.keys(grouped)
      .sort()
      .slice(-3);

    const avgSpo2 = [];
    const avgTemp = [];

  dates.forEach(d => {

  const spo2Arr = grouped[d].spo2;
  const tempArr = grouped[d].temp;

  const spo2Avg =
    spo2Arr.reduce((sum, val) => sum + Number(val), 0) / spo2Arr.length;

  const tempAvg =
    tempArr.reduce((sum, val) => sum + Number(val), 0) / tempArr.length;

  avgSpo2.push(Number(spo2Avg.toFixed(1)));
  avgTemp.push(Number(tempAvg.toFixed(1)));

});

    drawDailyChart(dates, avgSpo2, avgTemp);

  });

}
function drawDailyChart(dates, spo2Data, tempData) {

  const canvas = document.getElementById("dailyChart");
  if (!canvas) return;

  const ctx = canvas.getContext("2d");

  // 🔴 QUAN TRỌNG: destroy chart cũ trước khi vẽ mới
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
          data: spo2Data
        },
        {
          label: "Avg Temperature",
          data: tempData
        }
      ]
    }
  });
}