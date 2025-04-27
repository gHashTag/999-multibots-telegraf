I ran into bagful of troubles implementing Scenes myself, the main problem is lack of working examples or even detailed issues regarding the question. To help other people having similar issues, I'll just leave this tutorial here.

What are Scenes and WizardScene, what are their purpose?
Basic API of telegraf allows for implementation of simple interactions, such as:
command -> response or message -> response, trigger -> response

While that is quite powerful and easy to use, there is a set of tasks, that require to create a DIALOGUE between user and the bot. That is where Scenes and WizardScenes fill in.

What is a Scene, how does it work?
Scene is like a namespace, an abstract isolated room that user can be pushed into by means of code. When inside one, all the outer noise, such as global commands or message handlers, stop reacting on user actions.
Scenes can be entered, or left from, scenes can have their own hooks (command/message listeners), that only work while user is inside.

What kind of Scenes are there, what's the difference?
There are two types of Scenes, a more configurable BaseScene, or a less configurable, Step-based WizardScene.

How to create and use a BaseScene
BaseScene is just an isolated namespace that needs manually attached hooks, here is an example:

import { Scenes } from 'telegraf';

const scenarioTypeScene = new Scenes.BaseScene('SCENARIO_TYPE_SCENE_ID');

scenarioTypeScene.enter((ctx) => {
ctx.session.myData = {};
ctx.reply('What is your drug?', Markup.inlineKeyboard([
Markup.callbackButton('Movie', MOVIE_ACTION),
Markup.callbackButton('Theater', THEATER_ACTION),
]).extra());
});

scenarioTypeScene.action(THEATER_ACTION, (ctx) => {
ctx.reply('You choose theater');
ctx.session.myData.preferenceType = 'Theater';
return ctx.scene.enter('SOME_OTHER_SCENE_ID'); // switch to some other scene
});

scenarioTypeScene.action(MOVIE_ACTION, (ctx) => {
ctx.reply('You choose movie, your loss');
ctx.session.myData.preferenceType = 'Movie';
return ctx.scene.leave(); // exit global namespace
});

scenarioTypeScene.leave((ctx) => {
ctx.reply('Thank you for your time!');
});

// What to do if user entered a raw message or picked some other option?
scenarioTypeScene.use((ctx) => ctx.replyWithMarkdown('Please choose either Movie or Theater'));
How to create and use a WizardScene
WizardScene is a lot easier to use, it does not require any hooks, although it might have them.
WizardScene is created in via the following call
const wizardScene = new WizardScene(wizardSceneId, ...stepHandlers);

Context (ctx) inside wizardScene is enhanced with ctx.wizard field. That is step control interface, it has following fields:
ctx.wizard.next() - to advance to next step;
ctx.wizard.back() - to go back to previous step;
ctx.wizard.cursor - to get current step index;
ctx.wizard.selectStep(index) - to jump straight to a given step index, can be used to implement branching;

Normally each stepHandler, should end with ctx.wizard.next(); Once called, bot awaits for the next trigger from user, such as message or action, the result will be available in the next stepHandler.

If there was an error or ctx.wizard.next() was not called, current step is reentered and bot awaits for the next trigger from user. This can be used to implement validation

Example:

import { Scenes } from 'telegraf';

const contactDataWizard = new Scenes.WizardScene(
'CONTACT_DATA_WIZARD_SCENE_ID', // first argument is Scene_ID, same as for BaseScene
(ctx) => {
ctx.reply('What is your name?');
ctx.wizard.state.contactData = {};
return ctx.wizard.next();
},
(ctx) => {
// validation example
if (ctx.message.text.length < 2) {
ctx.reply('Please enter name for real');
return;
}
ctx.wizard.state.contactData.fio = ctx.message.text;
ctx.reply('Enter your e-mail');
return ctx.wizard.next();
},
async (ctx) => {
ctx.wizard.state.contactData.email = ctx.message.text;
ctx.reply('Thank you for your replies, we'll contact your soon');
await mySendContactDataMomentBeforeErase(ctx.wizard.state.contactData);
return ctx.scene.leave();
},
);
Is there a way to gain more control over stepHandlers
In fact there is. A step handler may be created as a Composer, this way you can attach multiple hooks to it, to have different response, based on the data.

How are Scenes attached to telegraf bot?
The foundational component of Scenes is a Stage,

import { Scenes } from 'telegraf';

const stage = new Scenes.Stage([scene1, scene2, scene3, ...]);
bot.use(session()); // to be precise, session is not a must have for Scenes to work, but it sure is lonely without one
bot.use(stage.middleware());
Stage itself is just there for the code sugar, you may think of it as a boilerplate to concatenate scenes into a middleware.

How to enter a scene (BaseScene or WizardScene)
Entering a scene can be a little tricky if you do not pay attention, the following code can be found in the original example:

NOT RECOMMENDED:
const stage = new Stage([scene1, scene2, ...], { default: 'CONTACT_DATA_WIZARD_SCENE_ID' });
this is a quite nasty way of entering scene. When default sceneId is provided as an option to Stage constructor, user automatically enters provided scene and there is no way of leaving scenes anymore. As soon as you call ctx.scene.leave(), you end up in the default scene.

CAUTION ADVISED:
Stage.enter('CONTACT_DATA_WIZARD_SCENE_ID');
this piece of code looks good and it is valid, but when you try using it, it doesn't work. Why? Because you're probably using it as a function, but it is in fact a middleware factory! So instead of doing this:

// BAD
bot.hears('hi', () => {
Stage.enter('CONTACT_DATA_WIZARD_SCENE_ID');
});
// ALSO BAD
bot.hears('hi', (ctx) => Stage.enter('CONTACT_DATA_WIZARD_SCENE_ID'));
You have to do this:

// GOOD
bot.hears('hi', Stage.enter('CONTACT_DATA_WIZARD_SCENE_ID'));
Recommended
ctx.scene.enter('CONTACT_DATA_WIZARD_SCENE_ID')
is the simple and reliable way of entering scenes. This code is not limited to the scope of current scene, it's available anywhere, once you enable stage.middleware(), global context is extended with ctx.scene, so you can freely use it anywhere in your application.

The same API (as 2 and 3) can be used to switch from one scene to another.

How to persist data between Scenes
If your bot has been extended with session middleware, you can always read/write data via ctx.session field. If you choose this path, you are responsible for initializing and cleaning up your session data.

If you are using WizardScene there is another option:

ctx.wizard.state
// or
ctx.scene.state
Actually these fields are almost identical, as they point to the same data object:
ctx.wizard.state -> ctx.scene.state -> ctx.session.state
The only difference is - first two automatically resolve to {}.

If you follow this path, you don't have to clean the data, as it is cleaned up automatically once you leave a scene or enter a new one.

If you combine BaseScenes with WizardScenes, state will be erased upon switching from one scene to another, but there is still a way:
You can pass state to another scene via second argument to ctx.scene.enter(sceneId, initialState). So if you use ctx.state, you can call ctx.scene.enter('MY_SCENE_ID', ctx.scene.state), and your state will be written into state of new scene.

To sum up
Dear Reader, I wrote all the stuff above inventing code on the fly, it has not been tested so small bugs might crawl in when copy pasted, and for that I am sorry. But all the info is actually well tested and will help you avoid the hole in documentation i've been struggling with, while digging in the underlying code.

I would like to share my enhancement of WizardScene mechanics, that allows for better code due to higher responsibility separation.

List of issues:

Allow complicated branching for scenes;
Allow to 'await' scene ending to execute some code;
Have a separate single place for branching code;
Make scenes reusable in same/different scenarios;
Allow defining scenes or steps in a separate files;
Provide a better alternative to step switching than by stepIndex (which is not safe);
How do we overcome all these issues? With a factory of course.
Here's the code for SceneFactory. It's not perfect and does not claim to be a library.

import WizardScene from 'telegraf/scenes/wizard';

const unwrapCallback = async (ctx, nextScene) => {
const nextSceneId = await Promise.resolve(nextScene(ctx));
if (nextSceneId) return ctx.scene.enter(nextSceneId, ctx.scene.state);
return ctx.scene.leave();
};

/\*\*

- Takes steps as arguments and returns a sceneFactory
-
- Additionally does the following things:
- 1.  Makes sure next step only triggers on `message` or `callbackQuery`
- 2.  Passes second argument - doneCallback to each step to be called when scene is finished
      \*/
      export const composeWizardScene = (...advancedSteps) => (
      /\*\*
      - Branching extension enabled sceneFactory
      - @param sceneType {string}
      - @param nextScene {function} - async func that returns nextSceneType
        _/
        function createWizardScene(sceneType, nextScene) {
        return new WizardScene(
        sceneType,
        ...advancedSteps.map((stepFn) => async (ctx, next) => {
        /\*\* ignore user action if it is neither message, nor callbackQuery _/
        if (!ctx.message && !ctx.callbackQuery) return undefined;
        return stepFn(ctx, () => unwrapCallback(ctx, nextScene), next);
        }),
        );
        }
        );
        How does it work, what does it do?
        Lets look at an example:

// scenes/contactData.js
import { composeWizardScene } from '../../utils/sceneFactory';

export const createContactDataScene = composeWizardScene(
(ctx) => {
ctx.reply('Please enter your credentials');
return ctx.wizard.next();
},
(ctx, done) => {
ctx.wizard.state.credentials = ctx.message.text;
return done();
},
);
In the above example, we created a sceneFactory, using nearly same interface as WizardScene, the amount of steps can be larger, for simplicity I only put 2.

So what are the differences:

We did not define a sceneId (or sceneType as I call it);
There is a new done function-argument in call to each step (instead of next);
Not impressed? Wait till we see how it works on the stage;

// reportStageWizard.js
import { createEntryScene } from '../scenes/entryData';
import { createContactDataScene } from '../scenes/contactData';
import { createOrderDataScene } from '../scenes/orderData';
import { createActionTimeScene } from '../scenes/actionTimeScene';
import { ENTRY_SCENE, CONTACT_DATA_SCENE, ORDER_DATA_SCENE, ACTION_TIME_SCENE } from '../scenes/sceneTypes';

const bot = new Composer();

const stage = new Stage([
// the following line defines ENTRY_SCENE, when scenario finishes, depending on hasCreds flag, it either switches to CONTACT_DATA_SCENE, or skips it to go straight for ORDER_DATA_SCENE
createEntryScene(ENTRY_SCENE, (ctx) => (ctx.session.hasCreds ? ORDER_DATA_SCENE : CONTACT_DATA_SCENE)),
// simple linear scenario, switch scenes one by one
createContactDataScene(CONTACT_DATA_SCENE, () => ORDER_DATA_SCENE),
createOrderDataScene(ORDER_DATA_SCENE, () => ACTION_TIME_SCENE),
// once done, we send the data, gathered during scenario and leave scene
createActionTimeScene(ACTION_TIME_SCENE, async (ctx) => {
const { fio, date, time, clientName, actionType } = ctx.wizard.state;
await sendReport({ date, time, clientName, actionType, fio, payment: '?' });
await ctx.reply('Thank you for your report');
}),
]);

bot.use(stage.middleware());
bot.command('test', Stage.enter(ENTRY_SCENE));
Let me first explain how create\*\*\*Scene works. It takes two arguments:
sceneType - is sceneId - a string identifier for the scene;
nextScene - is the wrapped done callback function that we call once scene finishes, current ctx is forced in its call. nextScene is used to control the flow of our stage, as it awaits for new sceneId to be returned. If that happens current ctx.wizard.state is automatically passed to ctx.scene.enter call. If it returns nullable value, then ctx.scene.leave() is called.

Now our stage actually has a meaning, it joins multiple scenes into a large scenario. And now we can split each scene logic into a separate file. Scene naming and branching is done in a single place, it can be both simple or complicated.

As an additional feature, I've added verification into each step - so that step function only fires if there was a message or callbackButton click from the user (does not fire if some old message got edited, etc.).

I've been trying to figure out where to post this, but I guess it's best placed near the original explanation above.
