export async function sendWhatsAppMessage(to: string, body: string) {
  try {
    const res = await fetch(`${process.env.WA_SERVICE_URL}/send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.WA_SERVICE_API_KEY!,
      },
      body: JSON.stringify({ to, body }),
    });

    const data = await res.json();

    if (!res.ok) {
      console.error('🔴 WA Service Error:', JSON.stringify(data, null, 2));
    } else {
      console.log('✅ Pesan sukses terkirim ke WhatsApp:', data);
    }

    return data;
  } catch (error) {
    console.error('🔴 Fetch request gagal:', error);
    return null;
  }
}