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

// ===== TAB SWITCH =====
function showTab(tabId) {

  document.querySelectorAll(".tab").forEach(tab=>{
    tab.style.display="none";
  });

  document.getElementById(tabId).style.display="block";

  if(tabId==="analytics"){
    loadDailyData();
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

// ===== CREATE CHART =====
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

// ===== CONNECT =====
client.on("connect",function(){

  console.log("MQTT Connected");

  client.subscribe("health/device01/data");

});

// ===== RECEIVE DATA =====
client.on("message",function(topic,message){

  const data=JSON.parse(message.toString());

  const timestamp=new Date().toISOString();
  const displayTime=new Date().toLocaleString();

  // ===== SpO2 =====
  const spo2El=document.getElementById("spo2");
  const spo2=parseFloat(data.spo2);

  spo2El.innerText=isNaN(spo2)?"--":spo2;

  // ===== Temperature =====
  const tempEl=document.getElementById("temp");
  const temp=parseFloat(data.temperature);

  tempEl.innerText=isNaN(temp)?"--":temp;

  // ===== Heart Rate =====
  const hrEl=document.getElementById("ecg");
  const heartRate=parseFloat(data.heart_rate);

  hrEl.innerText=isNaN(heartRate)?"--":heartRate+" BPM";

  // ===== SAVE FIREBASE =====
  if(!isNaN(spo2)&&!isNaN(temp)&&!isNaN(heartRate)){

    database.ref("healthData").push({
      timestamp:timestamp,
      spo2:spo2,
      temperature:temp,
      heart_rate:heartRate
    });

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

  // ===== UPDATE CHART =====
  labels.push(displayTime);

  spo2Data.push(spo2);
  tempData.push(temp);
  hrData.push(heartRate);

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

// ===== LOAD DAILY DATA =====
function loadDailyData(){

  database.ref("healthData").on("value",function(snapshot){

    const data=snapshot.val();

    if(!data)return;

    const grouped={};

    Object.values(data).forEach(item=>{

      const date=item.timestamp.substring(0,10);

      if(!grouped[date]){
        grouped[date]={spo2:[],temp:[]};
      }

      grouped[date].spo2.push(Number(item.spo2));
      grouped[date].temp.push(Number(item.temperature));

    });

    const dates=Object.keys(grouped).sort().slice(-3);

    const avgSpo2=[];
    const avgTemp=[];

    dates.forEach(d=>{

      const spo2Arr=grouped[d].spo2;
      const tempArr=grouped[d].temp;

      const spo2Avg=spo2Arr.reduce((a,b)=>a+b,0)/spo2Arr.length;
      const tempAvg=tempArr.reduce((a,b)=>a+b,0)/tempArr.length;

      avgSpo2.push(Number(spo2Avg.toFixed(1)));
      avgTemp.push(Number(tempAvg.toFixed(1)));

    });

    drawDailyChart(dates,avgSpo2,avgTemp);

  });

}

// ===== DAILY CHART =====
function drawDailyChart(dates,spo2Data,tempData){

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
          data:spo2Data
        },
        {
          label:"Avg Temperature",
          data:tempData
        }
      ]
    }
  });

}
