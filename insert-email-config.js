const { createClient } = require('@supabase/supabase-js');

// Inicializa Supabase con valores directos
// IMPORTANTE: Reemplaza estos valores con los de tu proyecto Supabase
const supabaseUrl = 'https://tu-proyecto.supabase.co';
const supabaseKey = 'tu-clave-anon-key';
const supabase = createClient(supabaseUrl, supabaseKey);

// ID del usuario para el que se creará la configuración
const userId = 'a0d52f60-4615-4665-8bd7-1d32a2e38646'; // Este es el ID que vimos en los logs

// Configuración de email a insertar
// IMPORTANTE: Para Gmail, necesitas usar una "Contraseña de aplicación" en lugar de tu contraseña normal
// Puedes crear una en: https://myaccount.google.com/apppasswords
// Si usas otro servicio como Outlook o un SMTP personalizado, ajusta los valores según corresponda
const emailConfig = {
  service: 'gmail',
  host: 'smtp.gmail.com',
  port: 465,
  secure: true,
  user_email: 'Maxi.arremousp7@gmail.com', // Ya parece estar configurado correctamente
  password: 'pbkg gyvf fmsd zozs', // Reemplaza con tu contraseña de aplicación de Gmail
  from_name: 'Sistema de Expensas',
  default_subject: 'Expensas del mes',
  default_template: '',
  user_id: userId,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString()
};

async function insertEmailConfig() {
  console.log('Insertando configuración de email para el usuario:', userId);
  
  try {
    const { data, error } = await supabase
      .from('email_configuration')
      .insert([emailConfig]);
    
    if (error) {
      console.error('Error al insertar la configuración de email:', error);
      return;
    }
    
    console.log('Configuración de email insertada correctamente');
    
    // Verificar que la configuración se haya insertado
    const { data: configs, error: selectError } = await supabase
      .from('email_configuration')
      .select('*');
    
    if (selectError) {
      console.error('Error al verificar la configuración insertada:', selectError);
      return;
    }
    
    console.log('Configuraciones en la base de datos:', configs.length);
    configs.forEach((config, index) => {
      console.log(`Configuración #${index + 1}:`, {
        id: config.id,
        service: config.service,
        email: config.user_email,
        user_id: config.user_id
      });
    });
  } catch (err) {
    console.error('Error inesperado:', err);
  }
}

insertEmailConfig();
