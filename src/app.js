"use strict";

//JS
import { d2Get, d2PostJson, d2PutJson } from "./js/d2api.js";

//CSS
import "./css/header.css";
import "./css/style.css";

//Test setup by calling API
async function testApi() {
    var sysInfo = await d2Get("/api/system/info.json");
    console.log(sysInfo.version);
}


window.helloWorld = async function () {
    await testApi();
    alert("Hello world...");

};
