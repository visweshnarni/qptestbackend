import express from "express";
import {
  parentMenu,
  handleParentResponse
} from "../controllers/parentIvrController.js";

const router = express.Router();

router.post("/menu", parentMenu);

router.post("/handle", handleParentResponse);

export default router;