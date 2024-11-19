const mysql = require('mysql2/promise')
/*Coneccion a mi base de datos local */

// const db = mysql.createConnection({
//     host: process.env.DATABASE_HOST,
//     user:process.env.DATABASE_USER,
//     password:process.env.DATABASE_PASSWORD,
//     database:process.env.DATABASE_NAME,
//   });

  const db = mysql.createPool({
    host: process.env.DATABASE_HOST,
    user:process.env.DATABASE_USER,
    password:process.env.DATABASE_PASSWORD,
    database:process.env.DATABASE_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

  db.getConnection((err) => {
    if (err) {
      console.error('Error connecting to MySQL: ' + err.stack);
      return;
    }
    console.log('Connected to MySQL as ID ' + db.threadId);
  });


  export default db;