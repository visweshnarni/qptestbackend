import pkg from "twilio";
const { twiml } = pkg;
import Outpass from "../models/Outpass.js";
import Student from "../models/Student.js";
import Class from "../models/Class.js";
import Employee from "../models/Employee.js";
import { makeNotificationCall } from "../utils/twilioService.js";

const VoiceResponse = twiml.VoiceResponse;

/*
Parent IVR Menu
*/
export const parentMenu = async (req, res) => {

  const { outpassId } = req.query;

  const response = new VoiceResponse();

  const gather = response.gather({
    numDigits: 1,
    action: `/api/parent-ivr/handle?outpassId=${outpassId}`,
    method: "POST"
  });

  gather.say(
    {
      voice: "alice",
      language: "en-IN"
    },
    "Hello. Your ward has requested an outpass from college. Press 1 to approve. Press 2 to reject. Press 3 to speak with the mentor."
  );

  res.type("text/xml");
  res.send(response.toString());
};


/*
Handle Parent Response
*/
export const handleParentResponse = async (req, res) => {

  const digit = req.body?.Digits || req.query?.Digits;
  const { outpassId } = req.query;

  const response = new VoiceResponse();

  const outpass = await Outpass.findById(outpassId)
    .populate("student");

  if (!outpass) {
    response.say("Invalid request.");
    return res.type("text/xml").send(response.toString());
  }
  console.log("Twilio payload:", req.body);

  /*
  PRESS 1 → APPROVE
  */

  if (digit === "1") {

    outpass.parentVerification.status = "approved";
    outpass.parentVerification.verifiedBy = "ivr";
    outpass.parentVerification.verifiedAt = new Date();

    if (outpass.mlDecision === "AUTO_APPROVE") {
      outpass.status = "approved";
    }

    await outpass.save();

    response.say("Thank you.");
  }

  /*
  PRESS 2 → REJECT
  */

  else if (digit === "2") {

    outpass.parentVerification.status = "rejected";
    outpass.status = "rejected";

    await outpass.save();

    response.say("The outpass request has been rejected.");
  }

  /*
  PRESS 3 → CONNECT TO MENTOR
  */

  else if (digit === "3") {

    const student = await Student.findById(outpass.student._id)
      .populate("class");

    const classData = await Class.findById(student.class._id)
      .populate("mentors");

    const mentor = classData.mentors[0];

    if (!mentor) {
      response.say("Mentor is not available.");
      return res.type("text/xml").send(response.toString());
    }

    const mentorPhone =
      mentor.phone.startsWith("+") ? mentor.phone : `+91${mentor.phone}`;

    response.say("Connecting you to the mentor.");

    response.dial(mentorPhone);
  }

  else {
    response.say("Invalid option selected.");
  }

  response.hangup();

  res.type("text/xml");
  res.send(response.toString());
};