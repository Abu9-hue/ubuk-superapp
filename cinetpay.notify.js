import crypto from 'crypto';

export default async function handler(req, res) {
  // CinetPay envoie une requête POST pour notifier le statut du paiement
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Méthode non autorisée' });
  }

  try {
    const { cpm_trans_id, cpm_site_id } = req.body;

    if (!cpm_trans_id) {
      return res.status(400).json({ error: 'ID de transaction manquant' });
    }

    // 1. Vérification officielle de la transaction auprès de l'API CinetPay
    const verifyPayload = {
      apikey: process.env.CINETPAY_API_KEY,
      site_id: cpm_site_id || process.env.CINETPAY_SITE_ID,
      transaction_id: cpm_trans_id
    };

    const response = await fetch('https://cinetpay.com', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(verifyPayload)
    });

    const verification = await response.json();

    // 2. Vérifier si le paiement est bien validé (code '00' et statut 'ACCEPTED')
    if (verification.code === '00' && verification.data?.status === 'ACCEPTED') {
      
      // Récupération des métadonnées envoyées lors de l'initialisation
      const metadata = verification.data.metadata 
        ? JSON.parse(verification.data.metadata) 
        : {};

      const {
        account,       // 'epargne', 'p2p', 'zakat', 'sadaqah', etc.
        net_amount,    // Montant net crédité
        fee,           // Frais totaux
        dorsal_60,     // Part 60%
        solidarity_40  // Part 40% solidarité
      } = metadata;

      // 3. Logique de répartition / mise à jour de ta base de données ici
      console.log(`Paiement validé : ${cpm_trans_id}`);
      console.log(`Compte : ${account} | Net : ${net_amount} XAF | Solidarité : ${solidarity_40} XAF`);

      // TODO : Insérer ici l'enregistrement dans ta base de données (Supabase, Firebase, MongoDB, etc.)

      return res.status(200).json({
        success: true,
        message: 'Transaction vérifiée et validée',
        transaction_id: cpm_trans_id
      });
    }

    // Si le paiement a échoué ou est en attente
    return res.status(200).json({
      success: false,
      status: verification.data?.status || 'FAILED',
      message: verification.message || 'Paiement non validé'
    });

  } catch (err) {
    console.error('Erreur Webhook CinetPay:', err);
    return res.status(500).json({ error: 'Erreur interne serveur' });
  }
        }
