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

firebase.initializeApp(firebaseConfig);
const database = firebase.database();

let dailyChart;
let currentPatientId = null;
let currentPatientName = "";
let patientListenerRef = null;

// ===== TAB SWITCH =====
function showTab(tabId){
  document.querySelectorAll(".tab").forEach(tab=>{
    tab.style.display="none";
  });

  document.getElementById(tabId).style.display="block";

  if(tabId==="analytics"){
    loadDailyData();
  }

}
 function selectPatient(patientId, patientName){
  currentPatientId = patientId;
  currentPatientName = patientName;

  document.getElementById("patientListPage").style.display = "none";
  document.getElementById("patientDashboard").style.display = "block";

  document.getElementById("selectedPatientName").innerText = patientName;
  document.getElementById("selectedPatientId").innerText = "Mã bệnh nhân: " + patientId;

  resetPatientUI();
  showTab("live");
  loadPatientHistory();
}

function goBack(){
  if(patientListenerRef){
    patientListenerRef.off();
    patientListenerRef = null;
  }

  currentPatientId = null;
  currentPatientName = "";

  document.getElementById("patientDashboard").style.display = "none";
  document.getElementById("patientListPage").style.display = "block";

  resetPatientUI();
}

function resetPatientUI(){
  document.getElementById("spo2").innerText = "--";
  document.getElementById("temp").innerText = "--";
  document.getElementById("ecg").innerText = "--";

  document.getElementById("historyList").innerHTML = "";

  document.getElementById("spo2").classList.remove("safe","warning","danger");
  document.getElementById("temp").classList.remove("safe","warning","danger");
  document.getElementById("ecg").classList.remove("safe","warning","danger");

labels.length = 0;
spo2Data.length = 0;
tempData.length = 0;
hrData.length = 0;

  if(spo2Chart){
    spo2Chart.data.labels = [];
    spo2Chart.data.datasets[0].data = [];
    spo2Chart.update();
  }

  if(tempChart){
    tempChart.data.labels = [];
    tempChart.data.datasets[0].data = [];
    tempChart.update();
  }

  if(hrChart){
    hrChart.data.labels = [];
    hrChart.data.datasets[0].data = [];
    hrChart.update();
  }

  if(dailyChart){
    dailyChart.destroy();
    dailyChart = null;
  }
}
// ===== DATA STORAGE =====
let labels=[];
let spo2Data=[];
let tempData=[];
let hrData=[];

let spo2Chart;
let tempChart;
let hrChart;


// ===== CREATE REALTIME CHART =====
window.onload=function(){

  const spo2Ctx=document.getElementById("spo2Chart").getContext("2d");
  const tempCtx=document.getElementById("tempChart").getContext("2d");
  const hrCtx=document.getElementById("hrChart").getContext("2d");

  spo2Chart=new Chart(spo2Ctx,{
    type:"line",
    data:{
      labels:labels,
      datasets:[{
        label:"SpO2 (%)",
        data:spo2Data,
        borderColor:"blue",
        fill:false
      }]
    }
  });

  tempChart=new Chart(tempCtx,{
    type:"line",
    data:{
      labels:labels,
      datasets:[{
        label:"Temperature (°C)",
        data:tempData,
        borderColor:"red",
        fill:false
      }]
    }
  });

  hrChart=new Chart(hrCtx,{
    type:"line",
    data:{
      labels:labels,
      datasets:[{
        label:"Heart Rate (BPM)",
        data:hrData,
        borderColor:"green",
        fill:false
      }]
    }
  });

};


// ===== MQTT CONFIG =====
const host="wss://c5c491454563470fad86602d8132fcab.s1.eu.hivemq.cloud:8884/mqtt";

const options={
  username:"device01",
  password:"Device2026"
};

const client=mqtt.connect(host,options);


// ===== CONNECT MQTT =====
client.on("connect",function(){

  console.log("MQTT Connected");

  client.subscribe("health/device01/data");

});


// ===== RECEIVE DATA =====
client.on("message",function(topic,message){

  const data=JSON.parse(message.toString());
  const dataPatientId = data.patientId || "bn01";
  console.log("MQTT DATA:",data);

  const timestamp=new Date().toISOString();
  const displayTime=new Date().toLocaleString();

  // ===== READ DATA =====
  const spo2=parseFloat(data.spo2);
  const temp=parseFloat(data.temperature);

  const heartRate=parseFloat(
    data.heart_rate ?? data.bpm ?? data.hr ?? data.heartRate
  );

  // ===== SAVE FIREBASE =====
  if(!isNaN(spo2)&&!isNaN(temp)&&!isNaN(heartRate)){
    database.ref("patients/" + dataPatientId + "/healthData").push({
      timestamp:timestamp,
      spo2:spo2,
      temperature:temp,
      heart_rate:heartRate
    });
  }

  // Chỉ cập nhật giao diện nếu đúng bệnh nhân đang chọn
  if(!currentPatientId || dataPatientId !== currentPatientId){
    return;
  }

  // ===== SpO2 DISPLAY + COLOR =====
  const spo2El=document.getElementById("spo2");

  spo2El.innerText=isNaN(spo2)?"--":spo2;

  spo2El.classList.remove("safe","warning","danger");

  if(!isNaN(spo2)){
    if(spo2>=95) spo2El.classList.add("safe");
    else if(spo2>=92) spo2El.classList.add("warning");
    else spo2El.classList.add("danger");
  }

  // ===== TEMP DISPLAY + COLOR =====
  const tempEl=document.getElementById("temp");

  tempEl.innerText=isNaN(temp)?"--":temp;

  tempEl.classList.remove("safe","warning","danger");

  if(!isNaN(temp)){
    if(temp<37.5) tempEl.classList.add("safe");
    else if(temp<=37.8) tempEl.classList.add("warning");
    else tempEl.classList.add("danger");
  }

  // ===== HEART RATE DISPLAY + COLOR =====
  const hrEl=document.getElementById("ecg");

  hrEl.innerText=isNaN(heartRate)?"--":heartRate+" BPM";

  hrEl.classList.remove("safe","warning","danger");

  if(!isNaN(heartRate)){
    if(heartRate>=60 && heartRate<=100) hrEl.classList.add("safe");
    else if(heartRate>=50 && heartRate<=120) hrEl.classList.add("warning");
    else hrEl.classList.add("danger");
  }

  // ===== HISTORY =====
  const historyList=document.getElementById("historyList");

  const item=document.createElement("div");

  item.className="card";

  item.innerHTML=`
  <p><strong>${displayTime}</strong></p>
  <p>SpO2: ${spo2}% | Temp: ${temp}°C | Heart Rate: ${heartRate} BPM</p>
  `;

  historyList.prepend(item);

  // ===== UPDATE REALTIME CHART =====
  labels.push(displayTime);

  spo2Data.push(isNaN(spo2)?null:spo2);
  tempData.push(isNaN(temp)?null:temp);
  hrData.push(isNaN(heartRate)?null:heartRate);

  if(labels.length>20){
    labels.shift();
    spo2Data.shift();
    tempData.shift();
    hrData.shift();
  }

  spo2Chart.update();
  tempChart.update();
  hrChart.update();

});


// ===== MQTT ERROR =====
client.on("error",function(err){

  console.log("MQTT Error:",err);

});

function loadPatientHistory(){
  if(!currentPatientId) return;

  if(patientListenerRef){
    patientListenerRef.off();
  }

  patientListenerRef = database.ref("patients/" + currentPatientId + "/healthData");

  patientListenerRef.on("value", function(snapshot){
    const data = snapshot.val();
    const historyList = document.getElementById("historyList");

    historyList.innerHTML = "";

   labels.length = 0;
   spo2Data.length = 0;
   tempData.length = 0;
   hrData.length = 0;

    if(!data){
      spo2Chart.update();
      tempChart.update();
      hrChart.update();
      return;
    }

    const records = Object.values(data).sort((a,b)=> new Date(a.timestamp) - new Date(b.timestamp));

    const latest20 = records.slice(-20);

    latest20.forEach(item=>{
      const displayTime = new Date(item.timestamp).toLocaleString();

      labels.push(displayTime);
      spo2Data.push(Number(item.spo2));
      tempData.push(Number(item.temperature));
      hrData.push(Number(item.heart_rate));
    });

    const latest = records[records.length - 1];
    if(latest){
      updateLatestPatient(latest);
    }

    records.slice().reverse().forEach(item=>{
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

function updateLatestPatient(item){
  const spo2 = Number(item.spo2);
  const temp = Number(item.temperature);
  const heartRate = Number(item.heart_rate);

  const spo2El = document.getElementById("spo2");
  const tempEl = document.getElementById("temp");
  const hrEl = document.getElementById("ecg");

  spo2El.innerText = isNaN(spo2) ? "--" : spo2;
  tempEl.innerText = isNaN(temp) ? "--" : temp;
  hrEl.innerText = isNaN(heartRate) ? "--" : heartRate + " BPM";

  spo2El.classList.remove("safe","warning","danger");
  tempEl.classList.remove("safe","warning","danger");
  hrEl.classList.remove("safe","warning","danger");

  if(!isNaN(spo2)){
    if(spo2 >= 95) spo2El.classList.add("safe");
    else if(spo2 >= 92) spo2El.classList.add("warning");
    else spo2El.classList.add("danger");
  }

  if(!isNaN(temp)){
    if(temp < 37.5) tempEl.classList.add("safe");
    else if(temp <= 37.8) tempEl.classList.add("warning");
    else tempEl.classList.add("danger");
  }

  if(!isNaN(heartRate)){
    if(heartRate >= 60 && heartRate <= 100) hrEl.classList.add("safe");
    else if(heartRate >= 50 && heartRate <= 120) hrEl.classList.add("warning");
    else hrEl.classList.add("danger");
  }
} 
// ===== LOAD DAILY DATA =====
function loadDailyData(){

  if(!currentPatientId) return;

database.ref("patients/" + currentPatientId + "/healthData").once("value",function(snapshot){

    const data=snapshot.val();

    if(!data)return;

    const grouped={};

    Object.values(data).forEach(item=>{

      const date=item.timestamp.substring(0,10);

      if(!grouped[date]){
        grouped[date]={spo2:[],temp:[],hr:[]};
      }

      grouped[date].spo2.push(Number(item.spo2));
      grouped[date].temp.push(Number(item.temperature));
      grouped[date].hr.push(Number(item.heart_rate));

    });


    const dates=Object.keys(grouped).sort().slice(-3);

    const avgSpo2=[];
    const avgTemp=[];
    const avgHR=[];

    dates.forEach(d=>{

      const spo2Arr=grouped[d].spo2;
      const tempArr=grouped[d].temp;
      const hrArr=grouped[d].hr;

      const spo2Avg=spo2Arr.reduce((a,b)=>a+b,0)/spo2Arr.length;
      const tempAvg=tempArr.reduce((a,b)=>a+b,0)/tempArr.length;
      const hrAvg=hrArr.reduce((a,b)=>a+b,0)/hrArr.length;

      avgSpo2.push(Number(spo2Avg.toFixed(1)));
      avgTemp.push(Number(tempAvg.toFixed(1)));
      avgHR.push(Number(hrAvg.toFixed(1)));

    });

    drawDailyChart(dates,avgSpo2,avgTemp,avgHR);

  });

}


// ===== DRAW DAILY CHART =====
function drawDailyChart(dates,spo2Data,tempData,hrData){

  const canvas=document.getElementById("dailyChart");

  if(!canvas)return;

  const ctx=canvas.getContext("2d");

  if(dailyChart){
    dailyChart.destroy();
  }

  dailyChart=new Chart(ctx,{
    type:"bar",
    data:{
      labels:dates,
      datasets:[
        {
          label:"Avg SpO2",
          data:spo2Data,
          backgroundColor:"#66b3ff"
        },
        {
          label:"Avg Temperature",
          data:tempData,
          backgroundColor:"#ff9999"
        },
        {
          label:"Avg Heart Rate",
          data:hrData,
          backgroundColor:"#66ff99"
        }
      ]
    }
  });

}
