import crypto from 'crypto';

export default async function handler(req, res) {
  // 1. Autorisation CORS entre ubuk-portail.vercel.app et ubuk-superapp.vercel.app
  const allowedOrigins = [
    'https://ubuk-portail.vercel.app',
    'https://ubuk-superapp.vercel.app'
  ];
  const origin = req.headers.origin;
  if (allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  // Réponse immédiate à la requête préliminaire du navigateur (Preflight)
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // 2. Vérification de la méthode HTTP
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Méthode non autorisée' });
  }

  try {
    const { amount, accountType, customerName, customerPhone } = req.body;
    const cleanAmount = Math.round(Number(amount));

    if (!Number.isFinite(cleanAmount) || cleanAmount < 100) {
      return res.status(400).json({ error: 'Montant invalide (minimum 100 XAF)' });
    }

    const validAccounts = ['epargne', 'zakat', 'sadaqah', 'waqf', 'vsla', 'seq', 'p2p', 'diaspora'];
    const targetAccount = validAccounts.includes(accountType) ? accountType : 'epargne';

    // 3. Génération d'un identifiant de transaction unique
    const timestamp = Date.now();
    const randomHex = crypto.randomBytes(4).toString('hex').toUpperCase();
    const transactionId = `UBUK-${targetAccount.toUpperCase()}-${timestamp}-${randomHex}`;

    // 4. Calcul des frais (Bouclier Frais & Règles UBUK PAY)
    let fee = 0;
    if (targetAccount === 'p2p') {
      fee = cleanAmount <= 5000 ? 50 : cleanAmount <= 25000 ? 150 : 300;
    } else if (targetAccount === 'diaspora') {
      fee = Math.round(cleanAmount * 0.015);
    } else if (!['zakat', 'sadaqah'].includes(targetAccount)) {
      fee = 100;
    }

    const totalToPay = cleanAmount + fee;
    const baseUrl = process.env.PUBLIC_URL || 'https://ubuk-superapp.vercel.app';
    const dorsal60 = Math.round(fee * 0.6);
    const solidarity40 = fee - dorsal60;

    // 5. Préparation de la requête officielle CinetPay
    const payload = {
      apikey: process.env.CINETPAY_API_KEY,
      site_id: process.env.CINETPAY_SITE_ID,
      transaction_id: transactionId,
      amount: totalToPay,
      currency: 'XAF',
      description: `UBUK PAY - Compte ${targetAccount.toUpperCase()}`,
      notify_url: `${baseUrl}/api/cinetpay/notify`,
      return_url: 'https://vercel.app',
      channels: 'ALL',
      metadata: JSON.stringify({
        account: targetAccount,
        net_amount: cleanAmount,
        fee: fee,
        dorsal_60: dorsal60,
        solidarity_40: solidarity40
      }),
      customer_name: customerName || 'Membre UBUK',
      customer_surname: 'Souverain',
      customer_phone_number: customerPhone || ''
    };

    const response = await fetch('https://cinetpay.com', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await response.json();

    if (data.code === '201' && data.data?.payment_url) {
      return res.status(200).json({
        success: true,
        transaction_id: transactionId,
        payment_url: data.data.payment_url
      });
    }

    return res.status(400).json({
      success: false,
      error: data.description || data.message || 'Erreur initialisation CinetPay'
    });

  } catch (err) {
    console.error('Erreur Init CinetPay:', err);
    return res.status(500).json({ error: 'Erreur interne serveur' });
  }
      }
