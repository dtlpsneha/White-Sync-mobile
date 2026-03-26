const http = require('http');

async function checkContact() {
    const options = {
        hostname: '13.234.62.39',
        port: 8080,
        path: '/api/resource/Contact?limit_page_length=1',
        method: 'GET',
        headers: {
            'Cookie': 'user_id=Administrator; system_user=yes; full_name=Administrator;' // Mocking a session for introspection if possible or we'll inspect the frontend API.
        }
    };

    const req = http.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => data += chunk);
        res.on('end', () => {
            console.log("Status:", res.statusCode);
            console.log("Data:", data);
        });
    });

    req.on('error', (e) => {
        console.error(e);
    });

    req.end();
}

checkContact();
