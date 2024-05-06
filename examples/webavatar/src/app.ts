import { SermasToolkit } from '@sermas/toolkit';

const appId = '45cdddf9-a4ac-4d61-acac-b49223e03de9';

const main = async () => {
  const toolkit = new SermasToolkit({
    url: 'http://localhost:8080',
    moduleId: 'kiosk',
    appId,
    auth: {
      url: 'http://localhost:8080',
      clientId: 'platform',
      realm: 'sermas-local',
    },
  });

  await toolkit.init();

  console.log(toolkit);
};

main().catch((e) => console.error(e.stack));
