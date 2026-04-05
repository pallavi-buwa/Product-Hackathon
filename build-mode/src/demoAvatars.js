/**
 * Stable portrait URLs for demo neighbors (randomuser.me) so faces stay
 * consistent everywhere and align with names for the pitch demo.
 * Falls back to pravatar in displayAvatarForProfile when id is unknown.
 */
const W = (n) => `https://randomuser.me/api/portraits/women/${n % 99}.jpg`;
const M = (n) => `https://randomuser.me/api/portraits/men/${n % 99}.jpg`;

export const demoAvatarUrlByUserId = {
  viewer: W(12),
  maya: W(22),
  noah: M(15),
  priya: W(33),
  elena: W(44),
  marcus: M(25),
  zoe: W(55),
  sam: M(35),
  jules: M(66),
  riley: W(77),
  casey: W(18),
  omar: M(42),
  alex: M(51),
  taylor: W(28),
  fatima: W(39),
  diego: M(62),
  amara: W(48),
  yuki: W(59),
  kwame: M(71),
  lin: W(19),
  anand: M(28),
  mei: W(41),
  sofia: W(52)
};
