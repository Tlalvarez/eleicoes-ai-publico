import test from 'node:test';
import assert from 'node:assert/strict';
import { querTexto } from '../functions/index.js';

const pedido = (ua, accept = 'text/html,application/xhtml+xml,*/*;q=0.8') => new Request('https://eleicoes.ai/', { headers: { 'User-Agent': ua, Accept: accept } });

test('navegador de gente recebe a home de sempre', () => {
  for (const ua of [
    'Mozilla/5.0 (iPhone; CPU iPhone OS 26_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0 Mobile Safari/537.36',
    'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
    'Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)',
    'WhatsApp/2.23.20.0', 'facebookexternalhit/1.1', 'LinkedInBot/1.0',
  ]) assert.equal(querTexto(pedido(ua)), false, ua);
});

test('assistente de IA, ou quem pede markdown, recebe o cartão de visita', () => {
  for (const ua of [
    'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; ChatGPT-User/1.0; +https://openai.com/bot',
    'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; OAI-SearchBot/1.0; +https://openai.com/searchbot',
    'Mozilla/5.0 (compatible; Claude-User/1.0; +Claude-User@anthropic.com)',
    'Mozilla/5.0 (compatible; PerplexityBot/1.0; +https://perplexity.ai/perplexitybot)',
  ]) assert.equal(querTexto(pedido(ua)), true, ua);
  assert.equal(querTexto(pedido('curl/8.7', 'text/markdown')), true);
  assert.equal(querTexto(pedido('curl/8.7', '*/*')), false);
});
