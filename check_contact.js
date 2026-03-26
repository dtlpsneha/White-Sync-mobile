const http = require('http');

const options = {
    hostname: '13.234.62.39',
    port: 8080,
    path: '/api/resource/Contact?limit_page_length=1',
    method: 'GET',
};

const req = http.request(options, (res) => {
    let data = '';
    res.on('data', (chunk) => data += chunk);
    res.on('end', () => {
        try {
            const parsed = JSON.parse(data);
            if (parsed.data && parsed.data.length > 0) {
                const contactId = parsed.data[0].name;

                const opt2 = {
                    hostname: '13.234.62.39',
                    port: 8080,
                    path: '/api/resource/Contact/' + encodeURIComponent(contactId),
                    method: 'GET',
                };
                const req2 = http.request(opt2, (res2) => {
                    let data2 = '';
                    res2.on('data', (d) => data2 += d);
                    res2.on('end', () => console.log(data2));
                });
                req2.end();
            } else {
                console.log("No contacts found.");
            }
        } catch (e) {
            console.log(e);
        }
    });
});

req.on('error', (e) => {
    console.error(e);
});

req.end();
