const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const { OpenAI } = require('openai'); // Install the OpenAI Node.js SDK
const { PutObjectCommand, S3Client } = require('@aws-sdk/client-s3');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

exports.fetchWeatherSummary = async (event) => {
  const { city } = event.pathParameters;

  // Step 1: Fetch Weather Data from OpenWeatherMap
  const weatherData = await fetchWeatherData(city);

  // Step 2: Generate a summary using the ChatGPT API
  const summary = await generateSummary(weatherData);

  // Step 3: Generate an image using DALL-E
  const weatherImage = await generateWeatherImage(summary);

  // Step 4: Save the result to S3
  const uuid = uuidv4()
  const summaryFileName = `${uuid}.json`;
  const imageFileName = `${uuid}.png`;

  await saveToS3(summaryFileName, Buffer.from(JSON.stringify({summary})));
  await saveToS3(imageFileName, weatherImage);

  return {
    statusCode: 200,
    body: JSON.stringify({
      message: 'Weather summary and image generated and saved to S3',
      summary,
      summaryFileName,
      imageFileName,
    }),
  };
};

async function fetchWeatherData(city) {
  const apiKey = process.env.OPENWEATHERMAP_API_KEY; // Replace with your OpenWeatherMap API key
  const url = `https://api.openweathermap.org/data/2.5/weather?q=${city}&appid=${apiKey}`;

  try {
    const response = await axios.get(url);
    return response.data;
  } catch (error) {
    console.error(`Error fetching weather data: ${error}`);
    throw new Error('Error fetching weather data');
  }
}

async function generateSummary(data) {
  const message = `Generate a concise weather summary with maximum of 1078 characters for ${JSON.stringify(data)}`
  const response = await openai.chat.completions.create({
    messages: [{ role: 'user', content: message,}],
    model: 'gpt-3.5-turbo',
  });

  return response.choices[0].message.content;
}

async function generateWeatherImage(summary) {
  const response = await openai.images.generate({
    prompt: summary,
    n: 1,
    response_format: 'b64_json',
    size: "512x512",
  });

  return Buffer.from(response.data[0].b64_json, 'base64');
}

async function saveToS3(fileName, data) {
  const client = new S3Client({});

  const command = new PutObjectCommand({
    Bucket: process.env.BUCKET_NAME,
    Key: `weatherData/${fileName}`,
    Body: data
  });

  try {
    const response = await client.send(command);
    console.log(response);
  } catch (err) {
    console.error(err);
  }
}