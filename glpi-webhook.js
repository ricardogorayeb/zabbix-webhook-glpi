try {
    Zabbix.log(4, '[GLPI Webhook] Iniciando...');

    var params = JSON.parse(value),
        req = new HttpRequest(),
        sessionToken;

    // Autenticação
    req.addHeader('Content-Type: application/json');
    req.addHeader('App-Token: ' + params.app_token);
    req.addHeader('Authorization: user_token ' + params.user_token);

    var initResponse = req.post(params.url + '/initSession', '');
    if (req.getStatus() !== 200) {
        throw 'Erro ao iniciar sessão: ' + req.getStatus();
    }

    sessionToken = JSON.parse(initResponse).session_token;
    if (!sessionToken) {
        throw 'session_token não obtido.';
    }

    // PROBLEMA: abre chamado
    if (params.event_value === '1') {
        var reqTicket = new HttpRequest();
        reqTicket.addHeader('Content-Type: application/json');
        reqTicket.addHeader('App-Token: ' + params.app_token);
        reqTicket.addHeader('Session-Token: ' + sessionToken);

        var payload = {
            input: {
                name: params.alert_subject + ' [Zabbix Event ID: ' + params.event_id + ']',
                content: params.alert_message,
                urgency: 3,
                type: 1, // 1 = Incidente, 2 = Requisição
                _users_id_requester: 0 // TROCAR: ID numérico do usuário do Zabbix no GLPI
            }
        };

        var ticketResponse = reqTicket.post(params.url + '/Ticket/', JSON.stringify(payload));

        if (reqTicket.getStatus() !== 201 && reqTicket.getStatus() !== 200) {
            throw 'Erro ao criar chamado. Status: ' + reqTicket.getStatus() + ' | ' + ticketResponse;
        }

        Zabbix.log(4, '[GLPI] Chamado criado: ' + ticketResponse);
        return 'OK - Chamado criado';

    // RECUPERAÇÃO: soluciona o chamado
    } else {
        var reqSearch = new HttpRequest();
        reqSearch.addHeader('Content-Type: application/json');
        reqSearch.addHeader('App-Token: ' + params.app_token);
        reqSearch.addHeader('Session-Token: ' + sessionToken);

        // field 1 = título, field 12 = status (1 = Novo), field 2 = ID
        var searchResponse = reqSearch.get(
            params.url + '/search/Ticket?criteria[0][field]=1&criteria[0][searchtype]=contains&criteria[0][value]=' +
            encodeURIComponent('Zabbix Event ID: ' + params.event_id) +
            '&criteria[1][field]=12&criteria[1][searchtype]=equals&criteria[1][value]=1' +
            '&forcedisplay[0]=2'
        );

        if (reqSearch.getStatus() !== 200) {
            throw 'Erro ao buscar chamado: ' + reqSearch.getStatus();
        }

        var result = JSON.parse(searchResponse);

        if (!result.data || result.data.length === 0) {
            Zabbix.log(3, '[GLPI] Nenhum chamado aberto encontrado para Event ID: ' + params.event_id);
            return 'OK - Nenhum chamado encontrado';
        }

        var ticketId = result.data[0]['2'];

        var reqSolution = new HttpRequest();
        reqSolution.addHeader('Content-Type: application/json');
        reqSolution.addHeader('App-Token: ' + params.app_token);
        reqSolution.addHeader('Session-Token: ' + sessionToken);

        var solutionPayload = {
            input: {
                itemtype: 'Ticket',
                items_id: ticketId,
                content: 'Resolvido automaticamente pelo Zabbix.<br>' +
                         'O problema foi normalizado sem intervenção manual.<br>' +
                         'Event ID: ' + params.event_id
            }
        };

        var solutionResponse = reqSolution.post(
            params.url + '/ITILSolution',
            JSON.stringify(solutionPayload)
        );

        if (reqSolution.getStatus() !== 201 && reqSolution.getStatus() !== 200) {
            throw 'Erro ao criar solução no chamado ' + ticketId + '. Status: ' + reqSolution.getStatus() + ' | ' + solutionResponse;
        }

        Zabbix.log(4, '[GLPI] Solução adicionada ao chamado ' + ticketId);
        return 'OK - Chamado solucionado';
    }

} catch (error) {
    Zabbix.log(3, '[GLPI] Falha: ' + error);
    throw 'Falha GLPI: ' + error;
}
