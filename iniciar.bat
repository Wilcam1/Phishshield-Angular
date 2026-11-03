@echo off
setlocal
chcp 65001 >nul
title PhishShield - Iniciador del Sistema

echo ======================================================================
echo           PHISHSHIELD - INICIADOR DE SERVICIOS DEFENSIVOS
echo ======================================================================
echo.

cd /d "%~dp0"

where node >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Node.js no esta instalado o no se encuentra en el PATH.
    echo Por favor instala Node.js ^(v20 o superior^) desde https://nodejs.org/
    echo.
    pause
    exit /b 1
)

where npm >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo [ERROR] npm no esta disponible en el PATH.
    echo.
    pause
    exit /b 1
)

if not exist "node_modules\" (
    echo [INFO] Primera ejecucion detectada: Instalando dependencias de Node.js...
    call npm install
    if %ERRORLEVEL% neq 0 (
        echo [ERROR] Fallo al instalar dependencias de Node.js.
        pause
        exit /b 1
    )
    echo [OK] Dependencias instaladas con exito.
    echo.
)

if not exist ".env" (
    if exist ".env.example" (
        echo [INFO] Archivo .env no encontrado. Creando copia desde .env.example...
        copy /y ".env.example" ".env" >nul
        echo [OK] Archivo .env inicializado.
        echo.
    )
)

if not exist "server\data\" (
    mkdir "server\data"
)

echo ----------------------------------------------------------------------
echo  Componentes que se iniciaran concurrentemente:
echo    [1] Microservicio ML en Python : Puerto 8000
echo    [2] Backend API Gateway Node.js : Puerto 3001 / 3000
echo    [3] Cliente Web Angular 22      : Puerto 4200 (http://localhost:4200)
echo ----------------------------------------------------------------------
echo.

set HAS_PYTHON=0
if exist "server\ml_service\venv\Scripts\python.exe" (
    set HAS_PYTHON=1
) else (
    where python >nul 2>&1
    if %ERRORLEVEL% equ 0 (
        set HAS_PYTHON=1
    )
)

if "%HAS_PYTHON%"=="1" (
    goto :INICIAR_FULL
) else (
    goto :INICIAR_NO_ML
)

:INICIAR_FULL
echo [OK] Motor Python detectado.
echo Iniciando todos los microservicios con npm start
echo.
call npm start
goto :FIN

:INICIAR_NO_ML
echo [ADVERTENCIA] No se detecto Python ni el entorno venv.
echo Iniciando en modo ligero resiliente con npm run start:no-ml
echo.
call npm run start:no-ml
goto :FIN

:FIN
echo.
echo ======================================================================
echo  Los servicios se han detenido.
echo ======================================================================
pause
