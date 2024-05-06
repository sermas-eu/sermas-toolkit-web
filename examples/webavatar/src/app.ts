import { SermasToolkit } from '@sermas/toolkit';

const main = async () => {
  const toolkit = new SermasToolkit({
    url: 'http://localhost:8080',
    moduleId: 'kiosk',
    appId: '',
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
