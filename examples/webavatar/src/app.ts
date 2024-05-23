import axios from 'axios';
import { SermasToolkit } from '@sermas/toolkit';

const appId = 'spxl';

type tokenResponse = {
  appId: string | null;
  accessToken?: string;
  refreshToken?: string;
  expiresIn?: Date;
};

const main = async () => {
  const { data: token } = await axios.get<tokenResponse>(
    `http://localhost:3000/auth/public/${appId}`,
  );

  const toolkit = new SermasToolkit({
    url: 'http://localhost:8080',
    moduleId: 'avatar',
    appId,
    auth: {
      url: 'http://localhost:8080',
      clientId: 'platform',
      realm: 'sermas-local',
    },
  });

  await toolkit.init(token.accessToken);

  await toolkit.createWebAvatar();
};

main().catch((e) => console.error(e.stack));
