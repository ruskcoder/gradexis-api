/**
 * Optional per-platform hook run after core's ClassLink flow follows the tile.
 *
 * For plain HAC this just stashes the landing page as `hacData` (data/info.js
 * reads the district banner from it). Conroe ISD needs extra authenticate hops
 * against its own gateway before HAC will serve pages, plus a different portal
 * host — that district-specific quirk lives here, not in core.
 *
 * @param {object} session - the SSO-authenticated session
 * @param {string} link - portal base URL discovered from the tile
 * @param {object} ctx - core loginClassLink result ({ appUrl, appHtml, exchangeCode })
 * @returns {Promise<{session, link}>}
 */
async function finalizeSSO(session, link, ctx) {
  let splash = ctx.appHtml;
  const tenant = ctx.exchangeCode?.data?.user?.tenantName || '';

  if (tenant.includes('Conroe ISD')) {
    const gwsToken = ctx.appUrl.split('GWSToken=')[1];
    await session.get(`https://cl-revp-25.conroeisd.net/authenticate?v=isapps.conroeisd.net&p=443&s=513&l=802&gwsToken=${gwsToken}`);
    await session.get(`https://cl-revp-25.conroeisd.net/authenticate?v=paclite.conroeisd.net&p=443&s=514&l=803&gwsToken=${gwsToken}`);
    await session.get(`https://cl-revp-25.conroeisd.net/authenticate?v=cisdnet.conroeisd.net&p=443&s=517&l=806&gwsToken=${gwsToken}`);

    const conroe = await session.get('https://hac.conroeisd.net/HomeAccess/District/Student/ConroeISD');
    splash = conroe.data;
    link = 'https://hac.conroeisd.net/';
  }

  session.hacData = splash;
  return { session, link };
}

export { finalizeSSO };
