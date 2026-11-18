# Platform Pendidikan Rasyatech Digital Zenith

## Struktur dan status

- `frontend/`: aplikasi React/Vite, dengan dependensi dan konfigurasi sendiri.
- `backend/`: API Express, skema Prisma PostgreSQL dan migrasi Neon.

Kedua workspace menggunakan satu repositori, lockfile, dan proses `npm install`.
Keduanya dapat dijalankan bersama atau terpisah, dan dibangun terpisah.
Pemisahan ini tidak menjamin kompatibilitas API jika kontraknya diubah;
frontend tetap membutuhkan backend untuk data nyata.

**Belum siap produksi:** akses master memakai akun database, sesi, dan
pembatas login terpusat, tetapi login sekolah, PPDB dan pembelajaran belum siap.
Akses master dan pendaftaran sekolah diaktifkan untuk pengujian produksi;
deployment dan operasional masih memerlukan pengujian lebih lanjut.
Rute dan API lama dinonaktifkan, termasuk form PPDB; jangan masukkan data
sungguhan sebelum implementasi dan pengujian selesai.
Data contoh lokal dan komponen prototipe yang tidak dipakai telah dihapus.

## Akun master admin

Setelah database dikonfigurasi dan migrasi diterapkan, tambahkan
`MASTER_ADMIN_EMAIL` ke `.env` root atau `backend/.env`, sesuai
`.env.example`. `MASTER_ADMIN_NAME` bersifat opsional. Kemudian jalankan di
terminal interaktif:

```powershell
npm run create:master
```

Jika belum diatur di `.env`, masukkan email dan nama saat diminta. Masukkan
kata sandi minimal 6 karakter dua kali. Untuk keamanan akun master, gunakan
kata sandi yang lebih panjang dan unik. Kata sandi tidak disimpan di `.env`,
tidak ditampilkan dan tidak boleh dikirim melalui chat. Perintah membuat
akun baru, tidak mengubah akun yang sudah ada. Klik ikon gembok di footer lima
kali untuk membuka halaman login master. Lima klik hanya navigasi, bukan
pengamanan; akses ditentukan oleh akun dan sesi yang diverifikasi server.
Dashboard menampilkan jumlah sekolah dan akun admin sekolah yang tercatat.
Menu Kelola Tenant menampilkan daftar sekolah tersimpan, tetapi belum dapat
menambah, mengubah, menghapus, atau mengaktifkan sekolah. Menu pengelolaan
lainnya belum tersedia dan belum terhubung ke data.
Untuk pengujian lokal, Admin Sekolah dan Guru dapat mengganti password dari
halaman masing-masing dengan memasukkan password saat ini. Setelah berhasil,
semua sesi akun berakhir dan pengguna harus masuk kembali. Master Admin tidak
termasuk karena pengelolaan akunnya akan dipindahkan ke Rasyatech Admin; alur
ganti password awal siswa tetap tersedia.

Formulir `/daftar` meneruskan pendaftaran LMS ke antrean tenant Rasyatech Admin.
Verifikasi dan aktivasi dilakukan dari Rasyatech Admin, bukan dari menu LMS.
Setelah provisioning berhasil, LMS membuat sekolah dan akun admin lalu menautkan
pendaftaran. Akun hanya dibuat sesudah persetujuan; undangan SMTP belum tersedia.
Integrasi end-to-end ini ditujukan untuk pengujian lokal dan belum siap produksi.
Master Admin LMS dapat menghapus pendaftaran beserta sekolah dan akun admin LMS
yang terhubung, hanya jika sekolah tidak memiliki data terkait. Penghapusan ini
tidak menghapus tenant di Rasyatech Admin dan memerlukan konfirmasi.
Pendaftaran dibatasi lima permintaan per IP per jam di PostgreSQL, termasuk
permintaan tidak valid; IP disimpan sebagai HMAC. Di Vercel diperlukan alamat
IP dari `x-vercel-forwarded-for`; bila IP atau database tidak tersedia,
permintaan ditolak. Respons kesalahan dapat berisi kode dan ID referensi
untuk dicocokkan dengan log Vercel tanpa menampilkan detail database.

### Integrasi provisioning internal (khusus uji)

Endpoint internal **belum siap produksi** dan menolak permintaan pada
`NODE_ENV=production`; pembatas login sekolah/LMS di produksi tidak diubah.
Terapkan migrasi pada database uji yang tepat dengan `npm run db:migrate:deploy`,
lalu atur `MASTER_PROVISION_SECRET` sebagai token acak yang panjang dan unik
serta `APP_ORIGIN` sebagai origin aplikasi tanpa slash penutup, misalnya
`http://localhost:3000` untuk uji lokal atau origin HTTPS. Atur keduanya hanya
di environment backend, jangan di frontend, repositori, atau log. Backend lokal
default hanya mendengarkan loopback. Untuk komunikasi antar-host gunakan TLS,
jaringan privat, dan batasi akses; jangan mengekspos token atau password.

### Integrasi pendaftaran LMS ke Rasyatech Admin (uji lokal)

Gunakan database uji dan data sekolah uji. Kedua aplikasi harus berjalan pada
mesin yang sama untuk alamat loopback di bawah. Di environment backend
Rasyatech Admin, atur `LMS_REGISTRATION_TOKEN` ke token acak panjang. Di
`backend/.env` LMS, atur:

```dotenv
MASTER_ADMIN_REGISTRATION_URL=http://127.0.0.1:3100/api/lms-registrations
MASTER_ADMIN_REGISTRATION_TOKEN=<token-yang-sama-dengan-LMS_REGISTRATION_TOKEN>
```

Untuk pengujian sementara, batas pendaftaran di Vercel Preview dan Production
adalah 5 permintaan per IP per 5 menit. Kembalikan batas Production ke 5
permintaan per IP per jam setelah pengujian selesai dan deploy ulang.
Batas Preview terpisah dari Production, tetapi gunakan database dan Rasyatech Admin uji yang
terpisah agar data uji tidak masuk ke layanan produksi. Aktifkan eksposur
system environment variables Vercel agar `VERCEL_ENV` tersedia, dan atur
`APP_ORIGIN` Preview ke origin HTTPS yang tepat (URL preview dinamis tidak
otomatis cocok). Preview harus digunakan melalui URL deployment Preview,
bukan domain Production.

Jangan gunakan token `MASTER_PROVISION_SECRET` untuk integrasi ini. Token itu
tetap khusus webhook provisioning pada gambar: `LMS_WEBHOOK_URL` di Rasyatech
Admin harus menunjuk ke `http://127.0.0.1:4000/api/internal/provision`, dan
`LMS_BEARER_TOKEN` harus sama dengan `MASTER_PROVISION_SECRET` di backend LMS.
Jangan menaruh token rahasia di frontend atau membagikannya.

Jalankan LMS dengan `npm run dev:all` (frontend port 3000, backend port 4000).
Jalankan Master Admin di terminal terpisah pada port 3100 dengan
`$env:PORT='3100'; npm run dev`. Kirim pendaftaran dengan NPSN valid dari halaman LMS;
sekolah akan muncul sebagai `LMS / PENDING` di antrean Verifikasi Rasyatech
Admin. Pilih **Setujui & Aktifkan** di Admin. Jika webhook provisioning
berhasil, sekolah dan akun admin dibuat di LMS dan halaman pendaftaran LMS
menampilkan bahwa sekolah telah dibuat. Jika konfigurasi atau koneksi gagal,
Admin menampilkan error dan tenant tetap pending; jangan menghapus atau
mengirim ulang data sebelum memeriksa antrean Admin.

Portal mengirim `Authorization: Bearer <MASTER_PROVISION_SECRET>` dan JSON ke
`POST /api/internal/provision`:

```json
{
  "institutionName": "Sekolah Uji",
  "npsn": "P1234567",
  "subdomain": "sekolah-uji",
  "adminName": "Admin Uji",
  "adminEmail": "admin@example.invalid",
  "adminPhone": "08123456789",
  "plan": "Tahunan",
  "expiresAt": "2099-12-31T23:59:59Z"
}
```

`subdomain` disimpan sebagai slug saja, bukan domain yang otomatis diarahkan.
`expiresAt` wajib timestamp UTC ISO 8601 (`Z`, detik dan opsional tiga digit
milidetik) dan harus di masa depan. Respons 201 berisi `success`, `tenantId`,
`loginUrl` (login bersama `APP_ORIGIN/login`), `initialUsername`, dan
`temporaryPassword`. Password hanya ditampilkan dalam respons tersebut;
simpan dan sampaikan melalui kanal aman. Akun admin sekolah saat ini belum
memiliki alur wajib ganti/reset password, jadi kredensial ini hanya untuk uji.
`GET /api/internal/health` memakai autentikasi yang sama dan hanya untuk menguji
koneksi lokal/staging; endpoint provisioning dan health-check tetap menolak
permintaan pada `NODE_ENV=production`.
NPSN, slug, dan email admin harus unik; duplikasi menghasilkan 409. Provisioning
tidak otomatis menautkan atau mengubah pendaftaran yang sudah ada, dan tidak
membuat invoice. Bila respons hilang setelah transaksi berhasil, jangan ulangi
secara buta: periksa tenant terlebih dahulu; password tidak dapat dipulihkan.

`PATCH /api/internal/tenants/:npsn/status` memakai autentikasi yang sama dan
body `{"status":"SUSPENDED","expiresAt":"2099-12-31T23:59:59Z"}`.
Status yang diterima `ACTIVE` atau `SUSPENDED`; aktivasi membutuhkan tanggal
masa depan. Status suspend atau kedaluwarsa memblokir login dan sesi admin,
guru, dan siswa; setiap perubahan status/tanggal mencabut sesi tenant. Sekolah
lama tetap aktif tanpa tanggal kedaluwarsa sampai diperbarui. Tidak ada
perubahan hak akses pada permintaan yang sudah diproses sebelum perubahan.
Endpoint tidak ditujukan untuk pemanggilan browser.

Untuk pengujian lokal, setujui dan provisioning tenant dari Rasyatech Admin;
langkah tersebut membuat sekolah dan akun admin LMS serta menautkan
pendaftarannya. Jangan jalankan `npm run create:school-admin` untuk tenant
yang sudah diprovision dari Rasyatech Admin karena NPSN dan email harus unik.
Admin dapat masuk melalui `/login`; sesi admin dan master terpisah.
Daftar siswa, guru, dan PPDB dibatasi berdasarkan sekolah akun. Impor siswa
tersedia untuk uji lokal melalui Data Siswa: pilih file `.xlsx` berukuran
maksimal 3 MB dengan satu sheet, header pada baris pertama dan maksimal 500
baris. Pilih pemetaan kolom dan periksa pratinjau sebelum menyimpan. Hanya
NISN, nama, email, dan telepon diimpor; format ekspor Dapodik belum diverifikasi
dengan contoh ekspor asli. NISN wajib 10 angka, termasuk nol awal (gunakan teks
atau format angka Excel yang mempertahankan nol). NISN yang sama dalam sekolah
yang sama diperbarui, sel kosong tidak menghapus data lama. Jika NISN ada di
sekolah lain atau tanpa sekolah, seluruh impor dibatalkan. Kelas tidak diimpor;
siswa baru tanpa email, telepon, atau kelas disimpan kosong dengan status Aktif.
Menu guru menyediakan penambahan data untuk uji lokal; NUPTK opsional.
Admin sekolah dapat membuat akun untuk siswa dan guru aktif pada daftar masing-masing.
Siswa login di `/lms/login` dengan NISN dan guru dengan email. Saat pembuatan
akun, password sementara acak ditampilkan sekali kepada admin sekolah, yang
harus menyampaikannya langsung kepada pemilik akun melalui cara yang aman.
Admin sekolah dapat mereset password guru atau siswa di sekolahnya jika hilang;
password baru ditampilkan sekali dan sesi lama dicabut. Password wajib diganti
dengan password berbeda (minimal 6 karakter); setelah perubahan semua sesi
akun dicabut dan pengguna harus login kembali. Akun lama yang masih memakai
`123456` tidak otomatis berubah dan perlu direset. Fitur LMS dan pembuatan akun
tetap hanya untuk uji lokal dan dinonaktifkan di `NODE_ENV=production`.
Guru yang sudah mengganti password awal dapat mencari siswa berdasarkan NISN
dan mereset password ke password sementara acak untuk uji lokal.
Reset hanya diizinkan untuk siswa aktif berakun dalam kelas yang guru tersebut
ajar menurut jadwal pada tahun ajaran aktif (tanggal Jakarta), di sekolah
yang sama. Semua sesi siswa dicabut dan siswa wajib mengganti password lagi.
Menu Kelas menyediakan penambahan dan perubahan kelas dengan wali guru aktif,
serta penempatan atau pemindahan siswa aktif berdasarkan NISN. Saat ini siswa
hanya memiliki satu kelas dan perubahan tidak menyimpan riwayat kelas; wali
kelas tidak otomatis memperoleh izin reset. Impor siswa belum menetapkan kelas.
Menu Tahun & Jadwal menyediakan tahun ajaran dan semester, mata pelajaran dan
KKM, serta penambahan dan penghapusan jadwal guru. Tahun ajaran aktif ditentukan
tanggal mulai dan selesai secara inklusif di zona Jakarta, bukan toggle; periode
yang bertumpang tindih bisa sama-sama aktif. Jadwal apa pun pada periode aktif
memberi guru hak reset siswa aktif di kelas terkait; pastikan data ini benar.
Guru dan siswa yang telah mengganti password dapat melihat jadwal mingguan di
LMS untuk periode aktif: guru melihat jadwalnya, siswa melihat jadwal kelasnya.
Siswa yang belum ditempatkan diminta menghubungi admin. Jadwal hanya menampilkan
data yang seluruh relasi akademiknya berada di sekolah yang sama.
Pada halaman LMS, guru dapat membuat materi teks/tautan HTTPS dan tugas untuk
kelas, mapel, serta tahun ajaran aktif sesuai jadwalnya. Siswa di kelas tersebut
dapat membaca materi dan mengumpulkan jawaban teks dan/atau tautan HTTPS.
Pengumpulan hanya sekali dan belum dapat diubah; jawaban setelah batas waktu
tetap diterima dan ditandai terlambat. Guru pembuat tugas dapat melihat
pengumpulan, memberi nilai 0–100 dan komentar; siswa melihat nilai dan komentar
untuk jawabannya sendiri. Batas waktu dimasukkan dan ditampilkan dalam WIB.
Materi, tugas, dan jawaban hanya tampil saat tahun ajaran aktif; penempatan
kelas siswa saat ini menentukan aksesnya. Tautan menuju layanan eksternal:
sekolah harus mengatur izin akses di layanan tujuan, karena LMS tidak dapat
melindungi isi tautan. Upload file, perubahan/penghapusan materi atau tugas,
perubahan jawaban, dan riwayat kelas belum tersedia.
Bentrok waktu belum dicek otomatis, dan jadwal yang salah dikoreksi dengan
menghapus lalu membuat ulang. Pengaturan kelas dibatasi hingga 500 kelas dan
500 guru aktif; akademik hingga 500 tahun, mapel, kelas, dan guru aktif serta
2000 jadwal per sekolah untuk uji lokal. Menu PPDB menampilkan tautan pendaftaran
khusus sekolah; admin dapat menerima atau menolak pendaftar. Persetujuan hanya
mencatat keputusan, belum membuat siswa maupun akun, dan belum mengirim
pemberitahuan. Tautan localhost hanya bisa digunakan di komputer tersebut.
Fitur KBM lainnya, perubahan manual data, dan pengiriman undangan
belum tersedia. Login dan data sekolah ditolak dalam mode produksi; jangan
gunakan data asli sampai seluruh alur dan isolasi tenant selesai diuji.

Sesi memakai cookie HttpOnly dan penyimpanan hash token di database. Saat
`NODE_ENV=production`, cookie memerlukan HTTPS. Deploy harus menggunakan HTTPS
dan reverse proxy dengan host asal yang sama, membatasi percobaan login di
proxy secara terpusat, dan menjalani peninjauan keamanan sebelum publikasi.
Backend produksi wajib mengatur `APP_ORIGIN` sebagai origin HTTPS publik yang
persis, misalnya `https://lms.example.com`, tanpa slash penutup, path, atau
query. Backend menolak startup jika konfigurasi ini tidak valid dan menolak
permintaan POST/PUT/PATCH/DELETE tanpa header `Origin` yang cocok. Klien
non-browser juga harus mengirim header tersebut. Origin bukan autentikasi;
server tetap memeriksa sesi. Jangan mempercayai header proxy dari internet
secara langsung. Atur keamanan HTTPS/HSTS, header halaman frontend, dan
perlindungan edge di penyedia reverse proxy; header API tidak melindungi halaman
frontend; konfigurasi Vercel menambahkan CSP dan header untuk frontend, tetapi
belum diuji di deployment nyata. Persyaratan ini tidak berarti aplikasi sudah
siap produksi.
Pada produksi, percobaan login juga dibatasi bersama melalui PostgreSQL untuk
IP dari `x-vercel-forwarded-for` dan identitas yang telah di-HMAC: maksimal
500 kegagalan per IP dan 10 kegagalan per identitas dalam 15 menit. Setelah
batas tercapai, percobaan berikutnya ditolak sementara, termasuk password yang
benar. Login berhasil tidak menambah atau menghapus hitungan kegagalan.
Identitas dan IP tidak disimpan dalam bentuk asli; login ditolak jika IP atau
database tidak tersedia. Batas identitas atau IP dapat mengunci pengguna
sementara jika diserang; siapkan pemantauan dan perlindungan edge.
Permintaan login pada IP yang sama diserialisasi untuk mencegah serangan
paralel melewati batas, sehingga antrean atau kegagalan sementara dapat terjadi
saat lalu lintas tinggi. Uji beban dan kapasitas koneksi database sebelum
produksi. Pembatas membutuhkan koneksi database tambahan. Mekanisme produksi
mengandalkan header yang diberikan Vercel; jangan mengekspos backend langsung
atau menambahkan proxy yang tidak tepercaya. Saat lokal pembatas juga memakai
PostgreSQL tetapi kunci acak berganti setiap server dimulai.

## Persiapan Vercel (belum siap produksi)

Konfigurasi di root disiapkan untuk satu proyek: frontend Vite, satu function
Express untuk `/api/*`, dan fallback SPA. Atur Root Directory ke root proyek,
Node.js 22 atau 24, dan gunakan build command dalam `vercel.json`. Di Environment
Variables Vercel atur `DATABASE_URL` (pooled), `DIRECT_URL` (migrasi),
`APP_ORIGIN` (origin HTTPS persis tanpa slash penutup), dan
`LOGIN_RATE_LIMIT_SECRET` (minimal 32 byte acak dalam bentuk hex). Buat secret
di terminal lokal dengan `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
dan simpan langsung di pengaturan Vercel, jangan bagikan lewat chat. Setiap
environment yang dapat diakses publik harus punya konfigurasi dan origin yang
sesuai; preview URL dinamis tidak otomatis cocok dengan `APP_ORIGIN`.
Jangan masukkan kredensial ke variabel `VITE_`.
Setelah mengubah environment variable, redeploy agar function menggunakan
nilai terbaru. Jika startup gagal karena konfigurasi, API mengembalikan HTTP
503 dengan kode seperti `DATABASE_URL_MISSING`, `APP_ORIGIN_INVALID`, atau
`LOGIN_RATE_LIMIT_SECRET_INVALID`. Kesalahan inisialisasi lainnya menghasilkan
`API_INITIALIZATION_FAILED` dan ID referensi pada log, tanpa menampilkan nilai
secret. Kegagalan import modul dapat tetap tersimpan pada instance yang sama;
perbaiki penyebabnya dan redeploy. Proteksi ini tidak menangani error yang
terjadi sebelum runtime dapat memuat entrypoint atau proses dihentikan platform.

Migrasi baru menambahkan tabel `LoginRateLimit`; jalankan migrasi dengan
`npm run db:migrate:deploy` secara terpisah setelah backup dan pemeriksaan target.
Build Vercel tidak menjalankan migrasi. Jika menggunakan satu database untuk uji
dan produksi, pengujian dan migrasi memengaruhi database yang sama; buat backup
dan jangan gunakan data sungguhan sebelum siap. Konfigurasi ini belum diuji
melalui deployment Vercel nyata. Endpoint sekolah, PPDB dan LMS tetap
ditolak dalam mode produksi; master dan pendaftaran sekolah diaktifkan untuk uji.
Jangan hapus pembatas lain sebelum pengujian end-to-end,
keamanan multi-tenant, audit, pemantauan, backup, dan deployment selesai.

## Menjalankan lokal

Di root proyek, jalankan `npm install` dan `npm run db:generate`. Isi
`DATABASE_URL` dan `DIRECT_URL` di `.env` root atau `backend/.env`; jangan
membagikan atau menyimpan kredensial dalam repositori. Terapkan migrasi dengan
`npm run db:migrate:deploy` pada database yang memang ditujukan untuk proyek ini
sebelum menggunakan pendaftaran sekolah.

Jalankan kedua server dalam satu terminal:

```powershell
npm run dev:all
```

Log backend ditandai `[BE]` dan frontend `[FE]`. Tekan Ctrl+C untuk menghentikan
keduanya. Server juga dapat dijalankan terpisah dengan `npm run dev:backend` dan
`npm run dev:frontend`.

API secara default mendengarkan pada `127.0.0.1:4000`; frontend pada port 3000
atau port berikutnya jika sedang dipakai. Vite meneruskan permintaan `/api` ke
API. Untuk mengubah target proxy, atur `VITE_API_PROXY_TARGET` di
`frontend/.env`; jangan taruh kredensial database di file frontend.
`PORT` dan `HOST` dapat diatur di environment backend.
Jika login melaporkan server tidak dapat dihubungi, pastikan backend
masih berjalan dan buka URL `Local` yang ditampilkan frontend. Mengisi
email di `.env` tidak mengubah akun atau kata sandi yang sudah ada di database.

### Instalasi PWA

Aplikasi dapat dipasang melalui menu instalasi browser yang mendukung PWA saat
diakses melalui HTTPS atau `localhost`. Di iOS, gunakan **Bagikan → Tambah ke
Layar Utama**. Fitur dan data tetap memerlukan internet; saat offline aplikasi
menampilkan pemberitahuan, bukan data yang tersimpan. Service worker hanya
didaftarkan pada build produksi dan tidak menyimpan respons API atau data sesi.

`npm run build` membangun frontend ke `frontend/dist` dan backend ke
`backend/dist`; masing-masing juga dapat dibangun dengan `npm run build:frontend`
atau `npm run build:backend`. Jalankan backend hasil build dengan
`npm run start -w backend`. `npm run lint` memeriksa kedua workspace.
Backend tidak melayani file frontend. Untuk deployment terpisah,
konfigurasi web server frontend harus meneruskan `/api/*` ke backend dan
permintaan rute aplikasi lainnya ke `index.html`. Vite proxy hanya untuk
development; `npm run preview -w frontend` tidak meneruskan `/api`.

## Database PostgreSQL / Neon

Skema utama adalah `backend/schema.prisma`, dengan migrasi di
`backend/migrations`. Gunakan `npm run db:generate` untuk Prisma Client dan
`npm run db:migrate:deploy` untuk menerapkan migrasi. Prisma CLI menggunakan
`DIRECT_URL` jika tersedia, sementara API menggunakan `DATABASE_URL`.
Model sekolah merupakan dasar pengembangan multi-sekolah, bukan isolasi yang
sudah siap pakai. Sebagian model lama masih mengizinkan `sekolahId` kosong;
otorisasi dan isolasi harus diselesaikan sebelum menambah sekolah. Model berkas
hanya menyimpan metadata; penyimpanan file dan kontrol akses belum tersedia.
