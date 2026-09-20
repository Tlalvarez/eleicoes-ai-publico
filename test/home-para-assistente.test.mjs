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

test('o leitor ao vivo do assistente, ou quem pede markdown, recebe o cartão de visita', () => {
  // só o robô que abre a página porque UMA PESSOA pediu agora; o rastreador de busca tem o seu teste abaixo
  for (const ua of [
    'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; ChatGPT-User/1.0; +https://openai.com/bot',
    'Mozilla/5.0 (compatible; Claude-User/1.0; +Claude-User@anthropic.com)',
    'Mozilla/5.0 (compatible; DuckAssistBot/1.0; +https://duckduckgo.com/duckassistbot)',
  ]) assert.equal(querTexto(pedido(ua)), true, ua);
  assert.equal(querTexto(pedido('curl/8.7', 'text/markdown')), true);
  assert.equal(querTexto(pedido('curl/8.7', '*/*')), false);
});

test('rastreador de busca recebe a home de verdade, não o cartão com noindex', () => {
  // 19/09/2026: os dois estavam na mesma lista. O índice do assistente recebia `noindex`, o site
  // nunca entrava na busca dele, e o leitor ao vivo recusava os links internos da página.
  const pede = (ua) => querTexto(new Request('https://eleicoes.ai/', { headers: { 'User-Agent': ua } }));
  for (const ua of ['Claude-SearchBot/1.0', 'OAI-SearchBot/1.0', 'GPTBot/1.2', 'PerplexityBot/1.0',
                    'Mozilla/5.0 (compatible; ClaudeBot/1.0)', 'meta-externalagent/1.1']) {
    assert.equal(pede(ua), false, `${ua} tem de receber a home indexável`);
  }
  for (const ua of ['ChatGPT-User/1.0', 'Claude-User/1.0', 'DuckAssistBot/1.0']) {
    assert.equal(pede(ua), true, `${ua} tem de receber o cartão`);
  }
});
