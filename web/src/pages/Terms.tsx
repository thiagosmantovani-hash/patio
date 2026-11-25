import { Link } from 'react-router-dom';

// Texto-base para o período de testes. Deve ser revisado por um advogado antes do uso comercial.

export function Terms() {
  return (
    <div className="legal">
      <Link to="/cadastro" className="back">← Voltar ao cadastro</Link>
      <h1>Termos de uso e política de privacidade</h1>
      <p className="muted">Versão de teste · atualizada em novembro de 2026</p>

      <h2>1. O que é o Pátio</h2>
      <p>O Pátio é um sistema on-line de gestão para revendas de veículos. Nesta fase ele é oferecido em período de teste, sem custo, para que as lojas usem no dia a dia e ajudem a melhorar o produto.</p>

      <h2>2. Conta e acesso</h2>
      <p>Quem cadastra a loja se torna o administrador da conta e responde pelos usuários que convidar. Cada pessoa deve ter o próprio login. Mantenha sua senha em sigilo e avise o suporte se suspeitar de uso indevido.</p>

      <h2>3. Dados da loja e dos clientes</h2>
      <p>Os dados lançados no sistema (veículos, clientes, vendas, financeiro) pertencem à loja. A loja é a controladora dos dados pessoais dos seus clientes e o Pátio atua como operador, tratando esses dados apenas para prestar o serviço, conforme a Lei Geral de Proteção de Dados (Lei 13.709/2018).</p>
      <p>Cada loja tem um banco de dados separado. Nenhuma outra loja tem acesso aos seus dados. A equipe do Pátio só acessa os dados da loja para suporte, quando solicitado, ou para manter o sistema funcionando.</p>

      <h2>4. O que guardamos sobre você</h2>
      <p>Nome, e-mail e senha (guardada de forma cifrada) dos usuários, dados cadastrais da loja e registros técnicos de acesso. Usamos essas informações para autenticar o acesso, dar suporte e melhorar o produto. Não vendemos dados a terceiros.</p>

      <h2>5. Período de teste</h2>
      <p>O período de teste é gratuito. Por se tratar de uma versão em desenvolvimento, funções podem mudar, e podem ocorrer falhas. Fazemos cópias de segurança diárias, mas recomendamos guardar os documentos importantes (contratos assinados, notas fiscais) também fora do sistema.</p>

      <h2>6. Encerramento e exclusão</h2>
      <p>A loja pode pedir a exportação ou a exclusão dos seus dados a qualquer momento pelo suporte. Ao fim do teste, se a loja não seguir usando o Pátio, os dados são excluídos em até 60 dias, salvo pedido de exportação.</p>

      <h2>7. Uso adequado</h2>
      <p>É proibido usar o sistema para fins ilegais, cadastrar dados de terceiros sem base legal ou tentar acessar dados de outras lojas. O acesso pode ser suspenso em caso de uso indevido.</p>

      <h2>8. Contato</h2>
      <p>Dúvidas, pedidos sobre dados pessoais ou suporte: fale com a equipe do Pátio pelo canal informado no seu cadastro.</p>
    </div>
  );
}
