QuickPass - Outpass Management System API
QuickPass is a robust backend API for managing student outpasses in an academic environment. Built with Node.js, Express, and MongoDB, this system handles user authentication, role-based access control, and a multi-level outpass approval workflow.

🌟 Features
Role-Based Access: The system supports three distinct roles: admin, student, and employee.

Secure Authentication: User authentication is handled with JWT (JSON Web Tokens) and secure password hashing using bcrypt.

Modular Architecture: The project has a clean and scalable structure with separate folders for controllers, models, routes, middlewares, and utils.

Outpass Workflow: A multi-step approval process where outpasses are first approved by a faculty member or mentor (facultyApproval) and then by the Head of Department (hodApproval).

Database Seeding: A dedicated script is included to seed the database with an initial admin user, making setup easy.

🚀 Getting Started
Follow these steps to set up and run the API on your local machine.

Prerequisites
Node.js (v18 or higher)

MongoDB (local installation or a cloud service like MongoDB Atlas)

1. Project Setup
Clone the repository and install the dependencies:

Bash

git clone <your-repository-url>
cd quickpass-api
npm install
2. Environment Variables
Create a .env file in the root directory of your project. This file is crucial for storing sensitive information.

Ini, TOML

# MongoDB Connection String
MONGO_URI=mongodb+srv://<username>:<password>@<cluster-uri>/quickpass?retryWrites=true&w=majority

# JWT Secret Token (generate a long, random string)
JWT_SECRET=<your-secret-token>
3. Database Seeding
Before you can use any protected routes, you need to create an initial admin user.

Bash

# This will create an admin user with email 'admin@quickpass.com' and password 'password123'
npm run seed:admin
4. Running the Server
Start the server in development mode. The server will automatically restart when you make file changes.

Bash

npm run dev
🔑 Authentication Workflow
Admin Login: Use the seeded admin credentials (admin@quickpass.com, password123) to log in via the /api/auth/login endpoint.

Receive Token: The API will return a JWT token. This token must be included in the Authorization header (Bearer <token>) for all protected routes.

Register Users: As an admin, use the token to register new students and employees via the /api/auth/register endpoints.

📝 Proposed Workflow
Student Action: A student logs in and applies for an outpass using the /api/outpass/apply endpoint. The outpass status is initially pending.

Faculty Action: A faculty member or mentor logs in and fetches pending outpasses for their department using /api/outpass/pending. They can then approve or reject a request, updating the facultyApproval status.

HOD Action: Once a faculty member has approved an outpass, an HOD logs in and reviews pending requests. They can provide the final approval, updating the hodApproval status.

Student Tracking: The student can track the status of their outpass at any time using the /api/outpass/mine endpoint.

📄 API Endpoints
All endpoints are prefixed with /api.

Authentication & User Management
POST /api/auth/login: Authenticate a user and get a JWT token. (Public access)

POST /api/auth/register/student: Register a new student. (Admin Only)

POST /api/auth/register/employee: Register a new employee. (Admin Only)

Outpass Management
POST /api/outpass/apply: A student applies for an outpass. (Student access)

GET /api/outpass/mine: Get all outpasses for the logged-in student. (Student access)

GET /api/outpass/pending: Get all pending outpasses for a faculty member or HOD. (Employee access)

PUT /api/outpass/:id/faculty-approve: Approve or reject an outpass. (Faculty access)

PUT /api/outpass/:id/hod-approve: Approve or reject an outpass. (HOD access)

Admin Endpoints
GET /api/admin/users: List all users (students and employees) in the system. (Admin access)

GET /api/admin/outpasses: List all outpasses in the system. (Admin access)