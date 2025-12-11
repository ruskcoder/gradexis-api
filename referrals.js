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

async function addUser(username, name, school, referredFrom = null) {
    if (referredFrom) referredFrom = referredFrom.toUpperCase();

    if (await userExists(username)) {
        if (referredFrom) {
            return {success: false, message: 'Referral codes must be blank for existing users' };
        }

        const updateFields = {};
        if (name) updateFields.name = name;
        if (school) updateFields.school = school;

        if (Object.keys(updateFields).length > 0) {
            const { error: updateError } = await supabase
                .from('referrals')
                .update(updateFields)
                .eq('username', username);
            if (updateError) console.error('Failed to update existing user fields:', updateError);
        }

        const { data, error } = await supabase
            .from('referrals')
            .select('referralCode, numReferrals')
            .eq('username', username)
            .single();
        
        if (error) throw error;
        return {success: true, referralCode: data.referralCode, numReferrals: data.numReferrals};
    }

    if (referredFrom && !await referralCodeExists(referredFrom)) {
        return {success: false, message: 'Invalid referral code'};
    }

    const userCode = generateCode();
    const { error } = await supabase
        .from('referrals')
        .insert([{ username, referredFrom, referralCode: userCode, numReferrals: 0, name, school }]);

    if (error) throw error;

    if (referredFrom) {
        const { data: referrerData, error: fetchError } = await supabase
            .from('referrals')
            .select('numReferrals')
            .eq('referralCode', referredFrom)
            .single();

        if (!fetchError && referrerData) {
            const { error: updateError } = await supabase
                .from('referrals')
                .update({ numReferrals: referrerData.numReferrals + 1 })
                .eq('referralCode', referredFrom);

            if (updateError) console.error('Failed to update referrer count:', updateError);
        } else {
            console.error('Failed to fetch referrer data:', fetchError);
        }
    }

    return {success: true, referralCode: userCode, numReferrals: 0};
}

async function getReferralInfo(username) { 
    const { data, error } = await supabase
        .from('referrals')
        .select('referralCode, numReferrals')
        .eq('username', username)
        .single();
    
    if (error) throw error;
    if (!data) {
        throw new Error(`Username '${username}' not found`);
    }
    return { referralCode: data.referralCode, numReferrals: data.numReferrals || 0 };
}

export {
    addUser,
    getReferralInfo
}
