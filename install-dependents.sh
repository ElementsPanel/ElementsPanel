#!/bin/sh
npm install
npm run preview-build

npm install --prefix core/daemon
mkdir -p daemon
cd daemon
echo "Installing lib dependencies..."
if [ ! -d lib ]; then
  mkdir lib
fi

echo "Downloading file_zip_linux_x64..."
curl -L -o ./lib/file_zip_linux_x64 https://github.com/MCSManager/Zip-Tools/releases/download/latest/file_zip_linux_x64
echo "Downloading 7z_linux_x64..."
curl -L -o ./lib/7z_linux_x64 https://github.com/MCSManager/Zip-Tools/releases/download/latest/7z_linux_x64
echo "Downloading pty_linux_x64..."
curl -L -o ./lib/pty_linux_x64 https://github.com/MCSManager/PTY/releases/download/latest/pty_linux_x64
chmod +x ./lib/file_zip_linux_x64 ./lib/7z_linux_x64 ./lib/pty_linux_x64

cd ../core/panel
npm install
cd ../frontend
npm install

echo "------------"
echo "All done!"
echo "------------"
