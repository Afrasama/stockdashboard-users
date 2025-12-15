# Stock Broker Client Web Dashboard

This project is a real-time Stock Broker Client Web Dashboard developed as part of the **KLE Escrow Stack (CUPI) Assignment**.

The application allows registered users to securely log in, subscribe to selected stock tickers, and view live stock price updates without refreshing the page. Stock prices are simulated using a random number generator and are updated every second.

---

## Features

- User registration and login using email and password  
- Secure password storage using hashing  
- Support for fixed stock tickers:
  - GOOG  
  - TSLA  
  - AMZN  
  - META  
  - NVDA  
- Users can subscribe and unsubscribe from stocks  
- Real-time stock price updates every second  
- Multiple users can log in simultaneously  
- Each user dashboard updates asynchronously based on subscribed stocks  
- Backend data stored in MongoDB  
- Real-time communication using Socket.IO  

---

## Technology Stack

- **Frontend:** HTML, CSS, JavaScript  
- **Backend:** Node.js, Express.js  
- **Real-Time Communication:** Socket.IO  
- **Database:** MongoDB (Atlas)  
- **Authentication:** Bcrypt.js (Password Hashing)  

---

## System Workflow

1. A new user registers using an email and password  
2. The password is securely hashed and stored in MongoDB  
3. Registered users can log in using valid credentials  
4. After login, users can subscribe to supported stock tickers  
5. The backend generates random stock prices every second  
6. Price updates are
