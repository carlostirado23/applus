const Usuario = require("../models/userModel");
const jwt = require("jsonwebtoken");

exports.registrar = async (req, res) => {
    const { nombre, email, usuario, password } = req.body;
    try {
        const user = await Usuario.registrar({ nombre, email, usuario, password });
        res.status(201).json({ message: "Usuario registrado correctamente", user });
    } catch (error) {
        res.status(400).json({
            message: "Error al registrar usuario",
            error: error.message,
        });
    }
};

exports.login = async (req, res) => {
    const { usuario, password } = req.body;
    try {
        const user = await Usuario.login({ usuario, password });

        // Generar token JWT
        const token = jwt.sign({ id: user.id, usuario: user.usuario, email: user.email }, process.env.JWT_SECRET, {
            expiresIn: "1d",
        });

        res.json({ message: "Login exitoso", token, user });
    } catch (error) {
        res.status(401).json({
            message: "Error al iniciar sesión",
            error: error.message,
        });
    }
};
