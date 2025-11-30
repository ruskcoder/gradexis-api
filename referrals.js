import supabase from './database.js';

function generateCode() { 
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
        code += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    return code;
}

async function userExists(username) {
    const { data, error, count } = await supabase
        .from('referrals')
        .select('*', { count: 'exact', head: true })
        .eq('username', username);
    
    if (error) throw error;
    return count > 0;
}

async function referralCodeExists(code) {
    const { error, count } = await supabase
        .from('referrals')
        .select('*', { count: 'exact', head: true })
        .eq('referralCode', code);
    
    if (error) throw error;
    return count > 0;
}

async function addUser(username, referredFrom = null, name = null) {
    if (referredFrom) referredFrom = referredFrom.toUpperCase();
    if (await userExists(username)) {
        if (referredFrom) {
            return {success: false, message: 'Referral codes must be blank for existing users' };
        }
        const refCode = await getReferralCode(username);
        return {success: true, referralCode: refCode};
    }
    
    if (referredFrom && !await referralCodeExists(referredFrom)) {
        return {success: false, message: 'Invalid referral code'};
    }
    
    const userCode = generateCode();
    const { error } = await supabase
        .from('referrals')
        .insert([{ username, referredFrom, referralCode: userCode, numReferrals: 0, name }]);
    
    
    if (referredFrom) {
        const { error: updateError } = await supabase
            .rpc('update_referral_count', { code: referredFrom });
        
        if (updateError) console.error('Failed to update referrer count:', updateError);
    }
    
    return {success: true, referralCode: userCode};
}

async function getNumberOfReferrals(username) { 
    const { data, error } = await supabase
        .from('referrals')
        .select('numReferrals')
        .eq('username', username);
    
    if (error) throw error;
    if (!data || data.length === 0) {
        throw new Error(`Username '${username}' not found`);
    }
    return data[0].numReferrals || 0;
}

async function getReferralCode(username) { 
    const { data, error } = await supabase
        .from('referrals')
        .select('referralCode')
        .eq('username', username);
    
    if (error) throw error;
    if (!data || data.length === 0) {
        throw new Error(`Username '${username}' not found`);
    }
    return data[0].referralCode;
}

export {
    addUser,
    getNumberOfReferrals,
    getReferralCode
}
