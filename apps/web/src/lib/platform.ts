/**
 * ショートカットの表示に使う修飾キー。
 *
 * 判定は表示のためだけのもので、キー処理は meta / ctrl のどちらでも受ける。
 * 外すと「⌘」が Windows に出るだけで、操作は効いたままになる。
 */
export const MOD_KEY = /mac|iphone|ipad/i.test(navigator.userAgent) ? '⌘' : 'Ctrl+';
