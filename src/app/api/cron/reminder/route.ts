import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { sendWhatsAppMessage } from '@/lib/whatsapp';

export const dynamic = 'force-dynamic';

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
    const dryRun = searchParams.get('dryRun') === 'true';

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

    const groupId = process.env.PST_GROUP_ID;
    if (!groupId) {
      return NextResponse.json({ error: 'PST_GROUP_ID belum diset di environment variable' }, { status: 500 });
    }

    // Susun nomor bersih & ID mention untuk tiap petugas
    const petugasWithClean = jadwalList.map((p) => ({
      ...p,
      cleanNumber: p.No_WA.replace(/\D/g, ''),
    }));

    const mentions = petugasWithClean.map((p) => `${p.cleanNumber}@c.us`);

    let messageBody: string;

    if (type === 'h-1') {
      const daftarPetugas = petugasWithClean
        .map((p) => `@${p.cleanNumber} (${p.Sesi})`)
        .join('\n');

      messageBody = `*PENGINGAT JADWAL PIKET PST*\n\nBesok, ${formattedTargetDate}, berikut petugas yang bertugas:\n\n${daftarPetugas}\n\nMohon menggunakan *Pakaian Dinas Harian (PDH) Biru lengkap dengan atribut*. Mari berikan pelayanan terbaik dan profesional bagi _#SahabatData._\n\nTerima kasih atas dedikasinya! 🙏\n\n_Pesan Otomatis dari New Pedro BPS Kota Metro_`;
    } else {
      const daftarPetugas = petugasWithClean
        .map((p) => `@${p.cleanNumber}`)
        .join('\n');

      messageBody = `*PENGINGAT PRESENSI & LOGBOOK PST*\n\nTerima kasih kepada petugas PST hari ini:\n\n${daftarPetugas}\n\nJangan lupa mengisi Daftar Hadir & Logbook Presensi melalui tautan resmi:\n\n🔗 s.bps.go.id/presensi_PST_Metro\n\nKedisiplinan mengisi presensi sangat mendukung akuntabilitas layanan instansi kita. ✨\n\n_Pesan Otomatis dari New Pedro BPS Kota Metro_`;
    }

    if (dryRun) {
      return NextResponse.json({
        dryRun: true,
        message: 'Ini simulasi, TIDAK ADA pesan yang benar-benar terkirim',
        targetGroupId: groupId,
        tanggal: formattedTargetDate,
        jumlahPetugas: jadwalList.length,
        mentions,
        previewPesan: messageBody,
      });
    }

    const result = await sendWhatsAppMessage(groupId, messageBody, mentions);

    return NextResponse.json({
      success: true,
      count: jadwalList.length,
      tanggal: formattedTargetDate,
      result,
    });
  } catch (error) {
    console.error('Error sending reminder:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}