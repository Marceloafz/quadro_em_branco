const EVENTS = {
  DESENHO: 'desenho',
  LIMPAR: 'limpar',
  HISTORICO: 'historico',
  CLIENTE_ENTROU: 'cliente:entrou',
  CLIENTE_SAIU: 'cliente:saiu',
  ERRO: 'erro',
};

if (typeof module !== 'undefined') module.exports = EVENTS;