import os
import urllib.request
import zipfile
import winreg
import ctypes
import sys

def enable_debug_mode():
    print("Enabling Premiere Pro Extensions Debug Mode in Windows Registry...")
    for i in range(8, 20):
        key_path = f"Software\\Adobe\\CSXS.{i}"
        try:
            key = winreg.CreateKey(winreg.HKEY_CURRENT_USER, key_path)
            winreg.SetValueEx(key, "PlayerDebugMode", 0, winreg.REG_SZ, "1")
            winreg.CloseKey(key)
        except Exception as e:
            print(f"Failed setting registry key for {key_path}: {e}")
    print("Debug mode enabled.")

def install_extension():
    extensions_dir = os.path.join(os.environ["APPDATA"], "Adobe", "CEP", "extensions")
    os.makedirs(extensions_dir, exist_ok=True)
    
    pymiere_dir = os.path.join(extensions_dir, "pymiere_link")
    if os.path.exists(pymiere_dir):
        print(f"Directory {pymiere_dir} already exists. Deleting...")
        import shutil
        shutil.rmtree(pymiere_dir)
    
    os.makedirs(pymiere_dir, exist_ok=True)
    
    url = "https://raw.githubusercontent.com/qmasingarbe/pymiere/master/pymiere_link.zxp"
    zxp_path = os.path.join(extensions_dir, "pymiere_link.zxp")
    
    print(f"Downloading {url}...")
    import ssl
    context = ssl._create_unverified_context()
    with urllib.request.urlopen(url, context=context) as response, open(zxp_path, 'wb') as out_file:
        out_file.write(response.read())
        
    print(f"Saved to {zxp_path}. Extracting...")
    
    # Extract
    with zipfile.ZipFile(zxp_path, 'r') as zip_ref:
        zip_ref.extractall(pymiere_dir)
        
    print(f"Extracted to {pymiere_dir}.")
    os.remove(zxp_path)
    
    print("Installation Complete!")

if __name__ == "__main__":
    enable_debug_mode()
    install_extension()
