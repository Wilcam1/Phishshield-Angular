@echo off
chcp 65001 >nul
title PhishShield - Iniciador del Sistema

echo ======================================================================
echo           🛡️  PHISHSHIELD - INICIADOR DE SERVICIOS DEFENSIVOS
echo ======================================================================
echo.

:: Cambiar al directorio del script
cd /d "%~dp0"

:: 1. Comprobar si existe Node.js
where node >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Node.js no está instalado o no se encuentra en el PATH.
    echo Por favor instala Node.js ^(v20 o superior^) desde https://nodejs.org/
    echo.
    pause
    exit /b 1
)

:: 2. Comprobar si existe npm
where npm >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo [ERROR] npm no está disponible en el sistema.
    echo.
    pause
    exit /b 1
)

:: 3. Verificar si existen los módulos de Node.js
if not exist "node_modules\" (
    echo [INFO] Primera ejecución detectada: Instalando dependencias de Node.js...
    call npm install
    if %ERRORLEVEL% neq 0 (
        echo [ERROR] Error al instalar dependencias de Node.js.
        pause
        exit /b 1
    )
    echo [OK] Dependencias de Node.js instaladas.
    echo.
)

:: 4. Comprobar si existe el archivo .env
if not exist ".env" (
    if exist ".env.example" (
        echo [INFO] Archivo .env no encontrado. Creando copia desde .env.example...
        copy /y ".env.example" ".env" >nul
        echo [OK] Archivo .env inicializado con valores por defecto.
        echo.
    )
)

:: 5. Asegurar existencia de la carpeta de datos
if not exist "server\data\" (
    mkdir "server\data"
)

:: 6. Verificar el entorno de Python para el microservicio de Machine Learning
set PYTHON_CMD=
if exist "server\ml_service\venv\Scripts\python.exe" (
    set "PYTHON_CMD=server\ml_service\venv\Scripts\python.exe"
) else (
    where python >nul 2>&1
    if %ERRORLEVEL% equ 0 (
        set "PYTHON_CMD=python"
    )
)

echo ----------------------------------------------------------------------
echo  Componentes que se iniciarán concurrentemente:
echo    [1] Microservicio ML en Python : Puerto 8000
echo    [2] Backend API Gateway Node.js : Puerto 3001 / 3000
echo    [3] Cliente Web Angular 22      : Puerto 4200 (http://localhost:4200)
echo ----------------------------------------------------------------------
echo.

if "%PYTHON_CMD%"=="" (
    echo [ADVERTENCIA] No se detectó Python ni el venv de Machine Learning.
    echo Iniciando en modo seguro resiliente (start:no-ml)...
    echo.
    call npm run start:no-ml
) else (
    echo [OK] Motor Python detectado (%PYTHON_CMD%).
    echo Iniciando todos los microservicios con npm start...
    echo.
    call npm start
)

if %ERRORLEVEL% neq 0 (
    echo.
    echo [INFO] Proceso detenido o finalizado con código: %ERRORLEVEL%
)

pause
