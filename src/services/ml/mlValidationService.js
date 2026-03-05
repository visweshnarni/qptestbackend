import axios from "axios";

export const validateOutpassWithML = async (payload) => {

  const ML_API_URL = process.env.ML_API_URL;

  if (!ML_API_URL) {
    throw new Error("ML_API_URL not defined in .env");
  }
  console.log("Calling ML API:", process.env.ML_API_URL);

  const response = await axios.post(ML_API_URL, payload);

  return response.data;
};