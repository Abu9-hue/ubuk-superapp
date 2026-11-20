import crypto from 'crypto';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Méthode non autorisée' });
  }

  try {
    const { amount, accountType, customerPhone, customerName } = req.body || {};
    const cleanAmount = Math.round(Number(amount));

    if (!Number.isFinite(cleanAmount) || cleanAmount < 100 || cleanAmount > 100000000) {
      return res.status(400).json({ error: 'Montant invalide (min. 100 XAF)' });
    }

    const validAccounts = ['epargne', 'zakat', 'sadaqah', 'waqf', 'vsla', 'seq', 'p2p', 'diaspora'];
    const targetAccount = validAccounts.includes(accountType) ? accountType : 'epargne';

    // Génération d'un identifiant de transaction unique et scellé
    const timestamp = Date.now();
    const randomHex = crypto.randomBytes(4).toString('hex').toUpperCase();
    const transactionId = `UBUK-${targetAccount.toUpperCase()}-${timestamp}-${randomHex}`;

    // Calcul du Bouclier Frais / Règle du Tiers Diaspora
    let fee = 0;
    if (targetAccount === 'p2p') {
      fee = cleanAmount <= 5000 ? 50 : cleanAmount <= 25000 ? 100 : cleanAmount <= 100000 ? 250 : Math.min(1500, Math.round(cleanAmount * 0.003));
    } else if (targetAccount === 'diaspora') {
      fee = Math.round((cleanAmount * 0.075) / 3); // 1/3 du tarif officiel
    } else if (!['zakat', 'sadaqah'].includes(targetAccount)) {
      fee = 100; // Bouclier Frais standard
    }

    const totalToPay = cleanAmount + fee;
    const baseUrl = process.env.PUBLIC_SITE_URL || 'https://vercel.app';

    const payload = {
      apikey: process.env.CINETPAY_APIKEY,
      site_id: process.env.CINETPAY_SITE_ID,
      transaction_id: transactionId,
      amount: totalToPay,
      currency: 'XAF',
      description: `UBUK PAY - Compte ${targetAccount.toUpperCase()} (0% Usure)`,
      notify_url: `${baseUrl}/api/cinetpay-webhook`,
      return_url: `${baseUrl}/ubuk-pay.html?status=done&tx=${transactionId}`,
      channels: 'ALL',
      metadata: JSON.stringify({
        account: targetAccount,
        net_amount: cleanAmount,
        fee: fee,
        dorsal_60: Math.round(fee * 0.6),
        solidarity_40: fee - Math.round(fee * 0.6)
      }),
      customer_name: (customerName || 'Citoyen UBUK').slice(0, 50),
      customer_surname: 'Souverain',
      customer_phone_number: (customerPhone || '+237600000000').replace(/[^0-9+]/g, '').slice(0, 16)
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
      error: data.description || 'Erreur initialisation CinetPay'
    });
  } catch (err) {
    return res.status(500).json({ error: 'Erreur interne serveur UBUK PAY' });
  }
        }
