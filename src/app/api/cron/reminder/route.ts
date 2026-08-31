import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { sendWhatsAppMessage } from '@/lib/whatsapp';

// Fungsi Helper Pembaca CSV (tetap sama)
function getJadwalByDate(targetDateStr: string) {
  const filePath = path.join(process.cwd(), 'data', 'jadwal_piket.csv');
  const fileContent = fs.readFileSync(filePath, 'utf-8');
  const lines = fileContent.split(/\r?\n/);
  const data = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const separator = line.includes(';') ? ';' : ',';
    const values = line.split(separator);

    data.push({
      Tanggal: values[0]?.trim(),
      Sesi: values[1]?.trim(),
      Nama: values[2]?.trim(),
      No_WA: values[3]?.trim(),
    });
  }
  return data.filter((row) => row.Tanggal === targetDateStr);
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type');

    const today = new Date();
    let targetDate = new Date();
    if (type === 'h-1') {
      targetDate.setDate(today.getDate() + 1);
    }
    const formattedTargetDate = targetDate.toISOString().split('T')[0];

    const jadwalList = getJadwalByDate(formattedTargetDate);

    if (jadwalList.length === 0) {
      return NextResponse.json({ message: `Tidak ada jadwal piket untuk tanggal ${formattedTargetDate}` });
    }

    // Kirim pesan teks biasa (tidak perlu template lagi)
    const results = [];

    for (const pegawai of jadwalList) {
      let messageBody;

      if (type === 'h-1') {
        messageBody = `*PENGINGAT JADWAL PIKET PST*\n\n Halo, Bpk/Ibu *${pegawai.Nama}*!👋\n\nMengingatkan bahwa *besok* pada tanggal *${formattedTargetDate}*, Bpk/Ibu dijadwalkan bertugas sebagai *Petugas PST* pada *sesi ${pegawai.Sesi}*.\n\nMohon untuk menggunakan *Pakaian Dinas Harian (PDH) Biru lengkap dengan atribut*. Mari berikan pelayanan terbaik dan profesional bagi _#SahabatData._\n\nTerima kasih atas dedikasi Bpk/Ibu! 🙏 \n\n _Pesan Otomatis dari New Pedro BPS Kota Metro_`;
      } else {
        messageBody = `*PENGINGAT PRESENSI & LOGBOOK PST*\n\n Semangat Sore, Bpk/Ibu *${pegawai.Nama}*\n\nTerima kasih Anda telah bertugas di meja layanan PST BPS Kota Metro hari ini pada *sesi ${pegawai.Sesi}*.\n\nJangan lupa untuk melakukan pengisian Daftar Hadir & Logbook Presensi Petugas PST melalui tautan resmi berikut:\n\n🔗 *s.bps.go.id/presensi_PST_Metro*\n\nKedisiplinan Bpk/Ibu dalam mengisi presensi sangat mendukung akuntabilitas dan pencatatan kinerja layanan instansi kita.✨\n\n_Pesan Otomatis dari New Pedro BPS Kota Metro_`;
      }

      const result = await sendWhatsAppMessage(pegawai.No_WA, messageBody);
      results.push({ nama: pegawai.Nama, no_wa: pegawai.No_WA, result });

      // Beri jeda antar pesan supaya tidak dianggap spam oleh WhatsApp
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }

    return NextResponse.json({ success: true, count: jadwalList.length, results });
  } catch (error) {
    console.error('Error sending reminder:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}