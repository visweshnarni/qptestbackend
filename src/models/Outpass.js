import mongoose from "mongoose";

const outpassSchema = mongoose.Schema(
  {
    student: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: "Student",
    },

    reasonCategory: {
      type: String,
      required: true,
    },

    reason: {
      type: String,
      required: true,
    },

    dateFrom: {
      type: Date,
      required: true, // expected exit time
    },

    dateTo: {
      type: Date,
      required: true, // expected return time
    },

    alternateContact: {
      type: String,
    },

    supportingDocumentUrl: {
      type: String,
    },

    attendanceAtApply: {
      type: Number,
    },

    /*
    =================================
    OUTPASS STATUS LIFECYCLE
    =================================
    */

    status: {
      type: String,
      enum: [
        "pending_ml",
        "pending_parent",
        "pending_faculty",
        "pending_hod",
        "approved",
        "rejected",
        "cancelled_by_student",
        "exited",
      ],
      default: "pending_ml",
    },

   /*
    ================================
    ML VALIDATION RESULTS
    ================================
    */

    mlDecision: {
      type: String,
      enum: ["AUTO_APPROVE", "MANUAL_VERIFY", "REJECT"],
    },

    mlExplanation: {
      type: String,
    },

    mlFeatures: {
      attendance_pct: Number,
      attendance_attainable: Number,
      past_outpasses_gt3: Number,
      is_emergency: Number,
      religious_exception: Number,
      doc_uploaded: Number,
      is_vague: Number,
      doc_supports_reason: Number,
      doc_has_date: Number,
      doc_date_valid: Number,
    },

    /*
    =================================
    PARENT VERIFICATION (IVR + FACULTY)
    =================================
    */

    parentVerification: {
      status: {
        type: String,
        enum: ["pending", "approved", "rejected", "no_response"],
        default: "pending",
      },

      verifiedBy: {
        type: String,
        enum: ["ivr", "faculty"],
      },

      responseKey: {
        type: Number, // 1 approve | 2 reject | 3 connect faculty
      },

      verifiedAt: {
        type: Date,
      },

      callAttempts: {
        type: Number,
        default: 0,
      },

      lastCallAt: {
        type: Date,
      },

      callTargets: [
        {
          phone: String,
          type: {
            type: String,
            enum: ["primary_parent", "secondary_parent"],
          },
        },
      ],
    },

    /*
    =================================
    APPROVAL FLOW
    =================================
    */

    facultyApprover: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Employee",
    },

    hodApprover: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Employee",
    },

    assignedMentor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Employee",
    },

    notifiedFaculty: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Employee",
      },
    ],

    rejectionReason: {
      type: String,
    },

    /*
    =================================
    SECURITY GATE VERIFICATION
    =================================
    */

    exitVerified: {
      status: {
        type: Boolean,
        default: false,
      },

      by: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Employee",
      },

      at: {
        type: Date,
      },
    },

    returnVerified: {
      status: {
        type: Boolean,
        default: false,
      },

      by: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Employee",
      },

      at: {
        type: Date,
      },
    },

    /*
    =================================
    ACTUAL GATE TIMES
    =================================
    */

    actualExitTime: {
      type: Date,
    },

    actualReturnTime: {
      type: Date,
    },
  },
  { timestamps: true }
);

const Outpass = mongoose.model("Outpass", outpassSchema);

export default Outpass;