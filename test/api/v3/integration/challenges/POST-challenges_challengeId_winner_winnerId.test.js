import {
  generateUser,
  generateChallenge,
  createAndPopulateGroup,
  sleep,
  checkExistence,
  translate as t,
} from '../../../../helpers/api-v3-integration.helper';
import { v4 as generateUUID } from 'uuid';

describe('POST /challenges/:challengeId/winner/:winnerId', () => {
  it('returns error when challengeId is not a valid UUID', async () => {
    let user = await generateUser();

    await expect(user.post(`/challenges/test/selectWinner/${user._id}`)).to.eventually.be.rejected.and.eql({
      code: 400,
      error: 'BadRequest',
      message: t('invalidReqParams'),
    });
  });

  it('returns error when winnerId is not a valid UUID', async () => {
    let user = await generateUser();

    await expect(user.post(`/challenges/${generateUUID()}/selectWinner/test`)).to.eventually.be.rejected.and.eql({
      code: 400,
      error: 'BadRequest',
      message: t('invalidReqParams'),
    });
  });

  it('returns error when challengeId is not for a valid challenge', async () => {
    let user = await generateUser();

    await expect(user.post(`/challenges/${generateUUID()}/selectWinner/${user._id}`)).to.eventually.be.rejected.and.eql({
      code: 404,
      error: 'NotFound',
      message: t('challengeNotFound'),
    });
  });

  context('Selecting winner for a valid challenge', () => {
    let groupLeader;
    let group;
    let challenge;
    let winningUser;

    beforeEach(async () => {
      let populatedGroup = await createAndPopulateGroup({
        members: 1,
      });

      groupLeader = populatedGroup.groupLeader;
      group = populatedGroup.group;
      winningUser = populatedGroup.members[0];

      challenge = await generateChallenge(groupLeader, group, {
        prize: 1,
      });

      await groupLeader.post(`/tasks/challenge/${challenge._id}`, [
        {type: 'habit', text: 'A challenge task text'},
      ]);

      await winningUser.post(`/challenges/${challenge._id}/join`);

      await challenge.sync();
    });

    it('returns an error when user doesn\'t have permissions to select winner', async () => {
      await expect(winningUser.post(`/challenges/${challenge._id}/selectWinner/${winningUser._id}`)).to.eventually.be.rejected.and.eql({
        code: 401,
        error: 'NotAuthorized',
        message: t('onlyLeaderDeleteChal'),
      });
    });

    it('returns an error when winning user isn\'t part of the challenge', async () => {
      let notInChallengeUser = await generateUser();

      await expect(groupLeader.post(`/challenges/${challenge._id}/selectWinner/${notInChallengeUser._id}`)).to.eventually.be.rejected.and.eql({
        code: 404,
        error: 'NotFound',
        message: t('winnerNotFound', {userId: notInChallengeUser._id}),
      });
    });

    it('deletes challenge after winner is selected', async () => {
      await groupLeader.post(`/challenges/${challenge._id}/selectWinner/${winningUser._id}`);

      await sleep(0.5);

      await expect(checkExistence('challenges', challenge._id)).to.eventually.equal(false);
    });

    it('adds challenge to winner\'s achievements', async () => {
      await groupLeader.post(`/challenges/${challenge._id}/selectWinner/${winningUser._id}`);

      await sleep(0.5);

      await expect(winningUser.sync()).to.eventually.have.deep.property('achievements.challenges').to.include(challenge.name);
    });

    it('gives winner gems as reward', async () => {
      let oldBalance = winningUser.balance;

      await groupLeader.post(`/challenges/${challenge._id}/selectWinner/${winningUser._id}`);

      await sleep(0.5);

      await expect(winningUser.sync()).to.eventually.have.property('balance', oldBalance + challenge.prize / 4);
    });
  });
});
