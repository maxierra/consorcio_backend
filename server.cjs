require('dotenv').config();
const express = require('express');
const nodemailer = require('nodemailer');
const puppeteer = require('puppeteer');
const { createClient } = require('@supabase/supabase-js');
const cors = require('cors');
const multer = require('multer');
const upload = multer();
const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' })); // Por si los HTMLs son grandes

// Inicializa Supabase con variables de entorno
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

// Obtiene la configuración de email para el usuario actual
async function getEmailConfig(userId) {
  console.log('Consultando configuración de email en la base de datos...');
  console.log('Usuario actual ID:', userId);
  
  // Primero verificamos si podemos acceder a la tabla y sus políticas
  console.log('Verificando acceso a la tabla email_configuration...');
  try {
    const { data: tables } = await supabase
      .rpc('get_tables');
    console.log('Tablas disponibles:', tables);
  } catch (err) {
    console.log('No se pudo obtener información de tablas:', err.message);
  }
  
  // Intentamos obtener todas las configuraciones sin filtrar por user_id
  console.log('Intentando obtener TODAS las configuraciones de email sin filtros...');
  let { data: allConfigs, error: allError } = await supabase
    .from('email_configuration')
    .select('*');
  
  if (allError) {
    console.error('Error al consultar todas las configuraciones:', allError);
  } else {
    console.log('Total de configuraciones sin filtrar:', allConfigs ? allConfigs.length : 0);
    if (allConfigs && allConfigs.length > 0) {
      allConfigs.forEach((config, index) => {
        console.log(`Config #${index + 1}:`, {
          id: config.id,
          service: config.service,
          email: config.user_email,
          user_id: config.user_id
        });
      });
    }
  }
  
  // SOLUCIÓN FORZADA: Creamos una configuración en memoria si no hay ninguna
  let data = allConfigs;
  let error = allError;
  
  if (!data || data.length === 0) {
    console.log('No se encontraron configuraciones. Usando configuración predeterminada en memoria...');
    
    // Configuración predeterminada en memoria (no se guarda en la base de datos)
    // Problema con Gmail: Vamos a probar con una solución alternativa
    
    // OPCIÓN 1: Configuración para Gmail con opciones diferentes
    const useGmail = true; // Cambiado a true para usar Gmail con la nueva contraseña
    
    if (useGmail) {
      // Configuración para Gmail con puerto 587 (alternativa)
      const gmailPassword = 'jxflkbzvvhmgpdqm'; // Nueva contraseña de aplicación sin espacios
      console.log('Usando configuración alternativa para Gmail con puerto 587...');
      
      data = [{
        id: 'default-config',
        service: 'gmail',
        host: 'smtp.gmail.com',
        port: 587, // Cambiando a puerto 587 en lugar de 465
        secure: false, // false para puerto 587
        user_email: 'Maxi.arremousp7@gmail.com',
        password: gmailPassword,
        from_name: 'Sistema de Expensas',
        default_subject: 'Expensas del mes',
        user_id: userId,
        // Opciones adicionales para Gmail
        auth: {
          user: 'Maxi.arremousp7@gmail.com',
          pass: gmailPassword
        },
        tls: {
          rejectUnauthorized: false
        }
      }];
    } else {
      // OPCIÓN 2: Usar una configuración simple para pruebas
      console.log('Usando configuración simple para pruebas');
      
      // Configuración simple para pruebas
      data = [{
        id: 'default-config',
        service: null, // No usar un servicio predefinido
        host: 'smtp.ethereal.email',
        port: 587,
        secure: false,
        user_email: 'test.user@ethereal.email', // Usuario temporal
        password: 'test.password', // Contraseña temporal
        from_name: 'Sistema de Expensas (Prueba)',
        default_subject: 'Expensas del mes (Prueba)',
        user_id: userId
      }];
      
      // Crear una cuenta de prueba en Ethereal (se creará en el endpoint)
      console.log('La cuenta de Ethereal se creará cuando se envíe un correo');
    }
    
    console.log('Usando configuración predeterminada:', data[0]);
    return data[0];
  }
  
  // Si llegamos aquí, encontramos configuraciones en la base de datos
  console.log('Usando la primera configuración encontrada en la base de datos');
  const emailConfig = data[0];
  
  console.log('Configuración de email a usar:', { 
    id: emailConfig.id,
    service: emailConfig.service, 
    email: emailConfig.user_email,
    host: emailConfig.host,
    port: emailConfig.port,
    user_id: emailConfig.user_id || 'No definido'
  });
  
  return emailConfig;
}

// Utilidad para convertir HTML a PDF buffer usando puppeteer
async function htmlToPdfBuffer(html) {
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: 'networkidle0' });
  const pdf = await page.pdf({ format: 'A4' });
  await browser.close();
  return pdf;
}

// Endpoint para recibir la info y enviar los emails (nuevo flujo con archivos PDF)
app.post('/api/send-expensas', upload.fields([
  { name: 'pdfIndividual', maxCount: 1 },
  { name: 'pdfResumen', maxCount: 1 }
]), async (req, res) => {
  try {
    console.log('Iniciando envío de expensas (con archivos PDF)...');
    // Archivos PDF
    const pdfIndividual = req.files['pdfIndividual']?.[0];
    const pdfResumen = req.files['pdfResumen']?.[0];

    // Datos del destinatario (string, debes parsear)
    const recipient = JSON.parse(req.body.recipient);

    if (!pdfIndividual || !pdfResumen || !recipient) {
      return res.status(400).json({ error: 'Faltan archivos PDF o datos del destinatario' });
    }

    // Configuración de Gmail (ajusta según tu entorno)
    const gmailUser = 'maxi.erramouspe77@gmail.com';
    const gmailPassword = 'jxflkbzvvhmgpdqm'; // Contraseña de aplicación

    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: gmailUser,
        pass: gmailPassword
      }
    });

    await transporter.verify();

    // Enviar email con ambos PDFs adjuntos
    const mailOptions = {
      from: `Sistema de Expensas <${gmailUser}>`,
      to: recipient.email,
      subject: `Expensas ${recipient.unidad}`,
      text: `Estimado ${recipient.propietario}, adjuntamos el resumen general y el detalle de su unidad.`,
      attachments: [
        {
          filename: pdfResumen.originalname || 'resumen.pdf',
          content: pdfResumen.buffer
        },
        {
          filename: pdfIndividual.originalname || `expensa_${recipient.unidad}.pdf`,
          content: pdfIndividual.buffer
        }
      ]
    };

    await transporter.sendMail(mailOptions);

    res.json({ ok: true, message: 'Expensas enviadas correctamente' });
  } catch (err) {
    console.error('Error enviando expensas:', err);
    res.status(500).json({ error: 'Error enviando expensas', details: err.message });
  }
});

// Función para insertar una configuración de email de prueba
async function insertTestEmailConfig() {
  try {
    console.log('Verificando si existe alguna configuración de email...');
    const { data, error } = await supabase
      .from('email_configuration')
      .select('*');
    
    if (error) {
      console.error('Error al verificar configuraciones de email:', error);
      return;
    }
    
    const count = data ? data.length : 0;
    console.log(`Se encontraron ${count} configuraciones de email`);
    
    if (count > 0) {
      console.log('Configuraciones existentes:');
      data.forEach((config, index) => {
        console.log(`Configuración #${index + 1}:`, {
          id: config.id,
          service: config.service,
          email: config.user_email,
          host: config.host,
          port: config.port,
          user_id: config.user_id || 'No definido'
        });
      });
    } else {
      console.log('No hay configuraciones de email. Insertando configuración de prueba...');
      
      // ID del usuario para el que se creará la configuración
      const userId = 'a0d52f60-4615-4665-8bd7-1d32a2e38646'; // Este es el ID que vimos en los logs
      
      // Configuración de email a insertar
      const emailConfig = {
        service: 'gmail',
        host: 'smtp.gmail.com',
        port: 465,
        secure: true,
        user_email: 'Maxi.arremousp7@gmail.com',
        password: 'pbkg gyvf fmsd zozs', // Reemplaza con tu contraseña de aplicación de Gmail
        from_name: 'Sistema de Expensas',
        default_subject: 'Expensas del mes',
        default_template: '',
        user_id: userId,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      
      const { error: insertError } = await supabase
        .from('email_configuration')
        .insert([emailConfig]);
      
      if (insertError) {
        console.error('Error al insertar la configuración de email:', insertError);
      } else {
        console.log('Configuración de email insertada correctamente');
      }
    }
  } catch (err) {
    console.error('Error al insertar configuración de email de prueba:', err);
  }
}

// Endpoint para enviar un correo de prueba simple (sin PDFs)
app.post('/api/test-email', async (req, res) => {
  try {
    console.log('Iniciando envío de correo de prueba...');
    const { email, userId } = req.body;
    
    if (!email || !userId) {
      return res.status(400).json({ error: 'Falta el email de destino o el userId' });
    }
    
    console.log(`Enviando correo de prueba a: ${email}`);
    
    // Intentar con Gmail primero
    console.log('Intentando enviar con Gmail...');
    const useGmail = true;
    
    if (useGmail) {
      try {
        // Configuración detallada para Gmail
        const gmailUser = 'maxi.erramouspe77@gmail.com';
        const gmailPassword = 'jxflkbzvvhmgpdqm'; // Contraseña de aplicación sin espacios
        
        console.log('Configurando transporter para Gmail...');
        console.log('Usuario:', gmailUser);
        console.log('Longitud de contraseña:', gmailPassword.length);
        
        // Crear transporter para Gmail
        const gmailTransporter = nodemailer.createTransport({
          service: 'gmail',
          auth: {
            user: gmailUser,
            pass: gmailPassword
          },
          debug: true, // Activar modo debug
          logger: true // Activar logger
        });
        
        console.log('Verificando conexión con Gmail...');
        await gmailTransporter.verify();
        console.log('Conexión con Gmail verificada correctamente');
        
        // Opciones del correo
        const mailOptions = {
          from: `Sistema de Expensas <${gmailUser}>`,
          to: email,
          subject: 'Correo de prueba',
          text: 'Este es un correo de prueba enviado desde la aplicación de expensas.',
          html: '<h1>Correo de prueba</h1><p>Este es un correo de prueba enviado desde la aplicación de expensas.</p>'
        };
        
        // Enviar el correo
        console.log('Enviando correo de prueba con Gmail...');
        const info = await gmailTransporter.sendMail(mailOptions);
        
        console.log('Correo enviado correctamente con Gmail');
        console.log('Respuesta:', info.response);
        
        return res.json({ 
          ok: true, 
          message: 'Correo enviado correctamente con Gmail',
          info: {
            messageId: info.messageId,
            response: info.response
          }
        });
      } catch (gmailError) {
        console.error('Error con Gmail:', gmailError);
        console.log('Fallback a Ethereal Email...');
      }
    }
    
    // Si Gmail falla, usar Ethereal como fallback
    console.log('Usando Ethereal Email como fallback...');
    
    // Crear una cuenta de prueba en Ethereal
    console.log('Creando cuenta de prueba en Ethereal...');
    const testAccount = await nodemailer.createTestAccount();
    console.log('Cuenta de prueba creada:', {
      user: testAccount.user
    });
    
    // Crear transporter con la cuenta de prueba
    const transporter = nodemailer.createTransport({
      host: 'smtp.ethereal.email',
      port: 587,
      secure: false,
      auth: {
        user: testAccount.user,
        pass: testAccount.pass
      }
    });
    
    console.log('Transporter creado con la cuenta de prueba');
    
    // Opciones del correo
    const mailOptions = {
      from: `Sistema de Expensas (Prueba) <${testAccount.user}>`,
      to: email,
      subject: 'Correo de prueba',
      text: 'Este es un correo de prueba enviado desde la aplicación de expensas.',
      html: '<h1>Correo de prueba</h1><p>Este es un correo de prueba enviado desde la aplicación de expensas.</p>'
    };
    
    // Enviar el correo
    console.log('Enviando correo de prueba con Ethereal...');
    const info = await transporter.sendMail(mailOptions);
    
    console.log('Correo enviado correctamente con Ethereal');
    console.log('Vista previa URL:', nodemailer.getTestMessageUrl(info));
    
    res.json({ 
      ok: true, 
      message: 'Correo enviado correctamente (simulado)', 
      previewUrl: nodemailer.getTestMessageUrl(info),
      note: 'Este es un correo simulado. Haz clic en el enlace para ver cómo se vería el correo.'
    });
  } catch (err) {
    console.error('Error enviando correo de prueba:', err);
    res.status(500).json({ error: 'Error enviando correo de prueba', details: err.message });
  }
});

// Iniciar el servidor y luego insertar la configuración de email
app.listen(3001, () => {
  console.log('Backend escuchando en puerto 3001');
  insertTestEmailConfig();
});