const mysql = require('mysql2/promise')


export  const db = mysql.createPool({
    host: process.env.DATABASE_HOST,
    user:process.env.DATABASE_USER,
    password:process.env.DATABASE_PASSWORD,
    database:process.env.DATABASE_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

export async function userExists(data: string | number, type: "userId" | "username" | "email"): Promise<boolean> {
    try {
      const validTypes = ["userId", "username", "email"];
      if (!validTypes.includes(type)) {
        throw new Error(`Invalid type: ${type}`);
      }
  
      const [rows]: any = await db.query(`SELECT COUNT(*) AS count FROM users WHERE ${type} = ?`, [data]);
      return rows[0].count > 0;
    } catch (error) {
      console.error("Error checking if user exists:", error);
      return false;
    }
  }
