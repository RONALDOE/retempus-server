import express, { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import nodemailer from 'nodemailer';
import {db} from '../utils/utils'; // Importa la conexión a la base de datos

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET; // Cambia esto por un valor seguro
const RESET_PASSWORD_SECRET = process.env.RESET_PASSWORD_SECRET; // Cambia esto por un valor seguro

// Middleware de validación para registro
const validateRegisterInput = (req: Request, res: Response, next: () => void): void => {
  const { username, email, password, name } = req.body;

  if (!username || !email || !password || !name) {
    res.status(400).json({
      error: "MISSING_DATA",
      message: "Todos los campos (username, email, password, name) son obligatorios.",
    });
    return;
  }
  next();
};

// Middleware de validación para inicio de sesión
const validateLoginInput = (req: Request, res: Response, next: () => void): void => {
  const { usernameOrEmail, password } = req.body;
  if (!usernameOrEmail || !password) {
    res.status(400).json({
      error: "MISSING_DATA",
      message: "El campo usernameOrEmail y password son obligatorios.",
    });
    return;
  }
  next();
};

// Ruta: Registrar usuario
router.post('/register', validateRegisterInput, async (req: Request, res: Response): Promise<void> => {
  const { username, email, password, name } = req.body;
  try {
    const [existingUser]: any = await db.query(
      `SELECT * FROM users WHERE email = ? OR username = ?`,
      [email, username]
    );



    if (existingUser.length > 0) {
      res.status(409).json({
        error: "USER_ALREADY_EXISTS",
        message: "El correo o nombre de usuario ya están en uso.",
      });
      return;
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const [result]: any = await db.query(
      `INSERT INTO users (username, hash, email, name) VALUES (?, ?, ?, ?)`,
      [username, hashedPassword, email, name]
    );

    res.status(201).json({
      message: "Usuario registrado exitosamente.",
      userId: result.insertId,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      error: "INTERNAL_SERVER_ERROR",
      message: "Ocurrió un error al registrar el usuario.",
    });
  }
});

// Ruta: Iniciar sesión
router.post('/login', validateLoginInput, async (req: Request, res: Response): Promise<void> => {
  const { usernameOrEmail, password } = req.body;
  console.log(usernameOrEmail)
  try {
    const [users]: any = await db.query(
      `SELECT * FROM users WHERE email = ? OR username = ?`,
      [usernameOrEmail, usernameOrEmail]
    );

    if (users.length === 0) {
      res.status(404).json({
        error: "USER_NOT_FOUND",
        message: "Usuario no encontrado.",
      });
      return;
    }

    const user = users[0];
    const isPasswordValid = await bcrypt.compare(password, user.hash);

    if (!isPasswordValid) {
      res.status(401).json({
        error: "INVALID_PASSWORD",
        message: "Contraseña incorrecta.",
      });
      return;
    }

    const token = jwt.sign({ userId: user.userId, username: user.username }, JWT_SECRET, {
      expiresIn: "1h",
    });

    res.status(200).json({
      message: "Inicio de sesión exitoso.",
      token,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      error: "INTERNAL_SERVER_ERROR",
      message: "Ocurrió un error al iniciar sesión.",
    });
  }
});

// Configuración de nodemailer
const transporter = nodemailer.createTransport({
    host: process.env.MAIL_HOST, // Cambia esto según el proveedor de correo
    port: process.env.MAIL_PORT, // Cambia esto según el proveedor de correo
    auth: {
      user: process.env.MAIL_USER, // Tu correo
      pass: process.env.MAIL_PASSWORD, // Contraseña de tu correo
    },
  });
  
  // Ruta: Solicitar restablecimiento de contraseña
  router.post('/forgot-password', async (req: Request, res: Response): Promise<void> => {
    const { email } = req.body;
  
    if (!email) {
      res.status(400).json({
        error: "MISSING_EMAIL",
        message: "El campo email es obligatorio.",
      });
      return;
    }
  
    try {
      const [users]: any = await db.query(`SELECT * FROM users WHERE email = ?`, [email]);
  
      if (users.length === 0) {
        res.status(404).json({
          error: "USER_NOT_FOUND",
          message: "No se encontró un usuario con ese correo.",
        });
        return;
      }
  
      const user = users[0];
      const token = jwt.sign({ userId: user.userId, email: user.email }, RESET_PASSWORD_SECRET, {
        expiresIn: '1h',
      });
  
      const resetLink = `http://localhost:3000/reset-password?token=${token}`; // Cambia la URL por la de tu frontend
  
      // Enviar correo
      await transporter.sendMail({
        from: process.env.MAIL_USER, // Tu correo
        to: email,
        subject: 'Restablecimiento de contraseña',
        html: `<p>Hola ${user.username},</p>
               <p>Hemos recibido una solicitud para restablecer tu contraseña.  Puedes hacerlo haciendo clic en el siguiente enlace:</p>
               <a href="${resetLink}">Restablecer contraseña. El enlace vencera en 1 hora</a>
               <p>Si no solicitaste este cambio, ignora este correo.</p>`,
      });
  
      res.status(200).json({
        message: "Se ha enviado un enlace de restablecimiento de contraseña a tu correo.",
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({
        error: "INTERNAL_SERVER_ERROR",
        message: "Ocurrió un error al procesar la solicitud.",
      });
    }
  });
  
  // Ruta: Restablecer contraseña
  router.post('/reset-password', async (req: Request, res: Response): Promise<void> => {
    const { token, newPassword } = req.body;
  
    if (!token || !newPassword) {
      res.status(400).json({
        error: "MISSING_DATA",
        message: "El token y la nueva contraseña son obligatorios.",
      });
      return;
    }
  
    try {
      const decoded: any = jwt.verify(token, RESET_PASSWORD_SECRET);
  
      const hashedPassword = await bcrypt.hash(newPassword, 10);
  
      await db.query(`UPDATE users SET hash = ? WHERE userId = ?`, [hashedPassword, decoded.userId]);
  
      res.status(200).json({
        message: "Contraseña actualizada exitosamente.",
      });
    } catch (error) {
      console.error(error);
      if (error.name === 'TokenExpiredError') {
        res.status(400).json({
          error: "TOKEN_EXPIRED",
          message: "El token ha expirado.",
        });
      } else {
        res.status(500).json({
          error: "INTERNAL_SERVER_ERROR",
          message: "Ocurrió un error al restablecer la contraseña.",
        });
      }
    }
  });
  

export default router;
