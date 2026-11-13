# Platform Pendidikan Rasyatech Digital Zenith

## Struktur dan status

- `frontend/`: aplikasi React/Vite, dengan dependensi dan konfigurasi sendiri.
- `backend/`: API Express, skema Prisma PostgreSQL dan migrasi Neon.

Kedua workspace menggunakan satu repositori, lockfile, dan proses `npm install`,
tetapi dijalankan dan dibangun terpisah. Pemisahan ini tidak menjamin kompatibilitas
API jika kontraknya diubah; frontend tetap membutuhkan backend untuk data nyata.

**Belum siap produksi:** akses master sudah memakai akun database dan sesi,
tetapi fitur administrasi, login sekolah, PPDB dan pembelajaran belum siap.
Semua endpoint master sekarang juga ditolak pada `NODE_ENV=production` sampai
perlindungan login terpusat dan deployment selesai diuji. Akses lokal tetap ada.
Rute dan API lama dinonaktifkan, termasuk form PPDB; jangan masukkan data
sungguhan atau publikasikan aplikasi sebelum implementasi dan pengujian selesai.
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

Formulir `/daftar` dan menu Verifikasi Sekolah/Rekap Pendaftar tersedia untuk
pengujian lokal: pendaftaran disimpan dan master dapat mencatat persetujuan,
penolakan, atau menghapus pendaftaran secara permanen setelah konfirmasi.
Penghapusan hanya menghapus pendaftaran, bukan data sekolah atau akun.
Persetujuan **belum** membuat sekolah atau akun dan tidak
mengirim undangan SMTP. Jangan gunakan data sungguhan atau publikasikan alur
ini. Pembatasan pendaftaran masih per proses dan bukan perlindungan terpusat.
API pendaftaran menolak permintaan saat `NODE_ENV=production`.

Untuk pengujian lokal, setelah pendaftaran disetujui, salin ID pendaftaran
dari menu Verifikasi Sekolah dan jalankan `npm run create:school-admin` di
terminal interaktif. Perintah membuat sekolah dan akun admin memakai email
kontak pendaftaran, lalu meminta kata sandi secara tersembunyi dua kali.
Perintah tidak mengirim undangan dan tidak mengubah akun yang sudah ada.
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

Migrasi baru menambahkan tabel `LoginRateLimit`; jalankan migrasi dengan
`npm run db:migrate:deploy` secara terpisah setelah backup dan pemeriksaan target.
Build Vercel tidak menjalankan migrasi. Jika menggunakan satu database untuk uji
dan produksi, pengujian dan migrasi memengaruhi database yang sama; buat backup
dan jangan gunakan data sungguhan sebelum siap. Konfigurasi ini belum diuji
melalui deployment Vercel nyata. Endpoint master, sekolah, PPDB dan LMS tetap
ditolak dalam mode produksi; jangan hapus pembatas sebelum pengujian end-to-end,
keamanan multi-tenant, audit, pemantauan, backup, dan deployment selesai.

## Menjalankan lokal

Di root proyek, jalankan `npm install` dan `npm run db:generate`. Isi
`DATABASE_URL` dan `DIRECT_URL` di `.env` root atau `backend/.env`; jangan
membagikan atau menyimpan kredensial dalam repositori.

Jalankan di dua terminal:

```powershell
npm run dev:backend
```

```powershell
npm run dev:frontend
```

API secara default mendengarkan pada `127.0.0.1:4000`; frontend pada port 3000
atau port berikutnya jika sedang dipakai. Vite meneruskan permintaan `/api` ke
API. Untuk mengubah target proxy, atur `VITE_API_PROXY_TARGET` di
`frontend/.env`; jangan taruh kredensial database di file frontend.
`PORT` dan `HOST` dapat diatur di environment backend.
Jika login melaporkan server tidak dapat dihubungi, pastikan terminal backend
masih berjalan dan buka URL `Local` yang ditampilkan terminal frontend. Mengisi
email di `.env` tidak mengubah akun atau kata sandi yang sudah ada di database.

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
