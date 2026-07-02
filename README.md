# Laporan Viewer - File Explorer

Aplikasi penampil laporan mingguan berbasis Web dengan tampilan modern premium, dilengkapi sistem keamanan halaman login berbasis password session dan relative pathing untuk integrasi reverse proxy Nginx.

## 📁 Struktur Instance & systemd

Aplikasi dideploy menggunakan systemd template service `laporan-viewer@.service` untuk mengelola 4 instance sekaligus pada port terpisah:

| Nama Service | URL Path | Port | Target Direktori Laporan |
| :--- | :--- | :--- | :--- |
| `laporan-viewer@weekly` | `/weekly/` | `18792` | `/home/akbar/weekly` |
| `laporan-viewer@baseline` | `/baseline/` | `18793` | `/home/akbar/task-weekly/src/laporan` |
| `laporan-viewer@vb` | `/vb/` | `18794` | `/home/akbar/weekly/VB/laporan/` |
| `laporan-viewer@agency` | `/agency/` | `18795` | `/home/akbar/weekly/agency/laporan` |

---

## 🛠️ Perintah Manajemen Service (systemd)

Jalankan perintah berikut di remote server untuk mengontrol layanan:

*   **Melihat status semua instance:**
    ```bash
    systemctl status laporan-viewer@weekly laporan-viewer@baseline laporan-viewer@vb laporan-viewer@agency
    ```
*   **Merestart instance tertentu (misal: agency):**
    ```bash
    sudo systemctl restart laporan-viewer@agency
    ```
*   **Melihat log live instance tertentu (misal: vb):**
    ```bash
    journalctl -u laporan-viewer@vb -f
    ```

---

## 🚀 CI/CD Otomatisasi (GitHub Actions)

Setiap ada perubahan kode yang di-push ke branch `main`, GitHub Actions akan otomatis melakukan:
1. SSH ke remote server.
2. Melakukan update kode (`git pull` via hard reset).
3. Melakukan instalasi dependensi (`npm install`).
4. Merestart keempat service systemd di atas secara aman.
