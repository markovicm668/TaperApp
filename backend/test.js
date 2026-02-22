require("dotenv").config();
const { GoogleGenerativeAI } = require("@google/generative-ai");

async function run() {
  console.log("Key loaded:", !!process.env.GEMINI_API_KEY);

  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({ model: "gemini-3-flash-preview" });

  try {
    const result = await model.generateContent("Reply ONLY with JSON: {\"ok\":true}");
    console.log("Gemini raw output:");
    console.log(result.response.text());
  } catch (err) {
    console.error("Gemini failed:");
    console.error(err);
  }
}

run();