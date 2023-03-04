/**
 * A source with a known credibility and follower count.
 */
import {doArrayTypeCheck, doNullableArrayTypeCheck, doNullableTypeCheck, doTypeCheck, isOfType} from "../../utils/types";
import {BrokenStudy, Post, PostComment, Source, Study} from "../study";
import {filterArray, selectRandomElement, selectWeightedRandomElement} from "../../utils/random";
import {odiff} from "../../utils/odiff";
import {getDataManager} from "../manager";
import { postResults } from "../../database/postToDB";
import {generateUID} from "../../utils/uid";
import {getUnixEpochTimeSeconds} from "../../utils/time";
import {compressJson, decompressJson} from "../../database/compressJson";
import {GamePostInteraction, GamePostInteractionStore} from "./interactions";


/**
 * Adjusts the current credibility of a source or participant,
 * and returns their new credibility.
 */
function adjustCredibility(current, change) {
    return Math.max(0, Math.min(current + change, 100));
}

/**
 * Adjusts the current followers of a source or participant,
 * and returns their new followers.
 */
function adjustFollowers(current, change) {
    return Math.max(0, current + change);
}

/**
 * A source in the game with known credibility and followers.
 */
export class GameSource {
    // The study is not saved as part of the game states, it is only here for convenience.
    study; // Study

    source; // BaseSource
    credibility; // Number
    followers; // Number
    remainingUses; // Number

    constructor(study, source, credibility, followers, remainingUses) {
        doTypeCheck(study, Study, "Source's Study");
        doTypeCheck(source, Source, "Source's Metadata");
        doTypeCheck(credibility, "number", "Source's Credibility");
        doTypeCheck(followers, "number", "Source's Followers");
        doTypeCheck(remainingUses, "number", "Source's Remaining Uses");
        this.study = study;
        this.source = source;
        this.credibility = credibility;
        this.followers = followers;
        this.remainingUses = remainingUses;
    }

    /**
     * Returns a copy with of this source with adjusted credibility,
     * followers, and remaining uses.
     */
    adjustAfterPost(credibilityChange, followersChange) {
        const newCredibility = adjustCredibility(this.credibility, credibilityChange);
        const newFollowers = adjustFollowers(this.followers, followersChange);
        const newUses = Math.max(-1, this.remainingUses - 1);
        return new GameSource(this.study, this.source, newCredibility, newFollowers, newUses);
    }

    toJSON() {
        return {
            "sourceID": this.source.id,
            "credibility": this.credibility,
            "followers": this.followers,
            "remainingUses": this.remainingUses
        };
    }

    static fromJSON(json, study) {
        return new GameSource(
            study,
            study.getSource(json["sourceID"]),
            json["credibility"],
            json["followers"],
            json["remainingUses"]
        );
    }

    /**
     * Selects a random source to show, weighted by source's max posts.
     */
    static selectRandomSource(sources) {
        const availableSources = filterArray(
            sources,
            (source) => source.remainingUses === -1 || source.remainingUses > 0
        );
        if (availableSources.length === 0)
            throw new Error("All sources hit their maximum number of posts");

        return selectWeightedRandomElement(
            availableSources,
            () => false,
            (source) => source.source.maxPosts === -1 ? 0 : source.source.maxPosts
        );
    }

    /**
     * Returns the first source in {@param sources} that has the ID {@param id}.
     */
    static findById(sources, id) {
        for (let index = 0; index < sources.length; ++index) {
            const source = sources[index];
            if (source.source.id === id)
                return source;
        }
        throw new Error("Could not find source with ID " + id);
    }

    /**
     * Creates a new source for use in the game by sampling its
     * credibility and followers from the supplied distribution.
     */
    static sampleNewSource(study, source) {
        doTypeCheck(study, Study, "Study")
        doTypeCheck(source, Source, "Source");
        const credibility = source.credibility.sample();
        const followers = source.followers.sample();
        return new GameSource(study, source, credibility, followers, source.maxPosts);
    }
}

export class GamePostComment {
    comment; // BaseComment
    numberOfReactions; // {String: Number}

    constructor(comment, numberOfReactions) {
        doTypeCheck(comment, PostComment, "Comment's Metadata");
        doTypeCheck(numberOfReactions, "object", "Number of reactions for the comment");
        this.comment = comment;
        this.numberOfReactions = numberOfReactions;
    }

    toJSON() {
        return {
            "numberOfReactions": this.numberOfReactions
        };
    }

    static fromJSON(json, index, post) {
        return new GamePostComment(
            post.comments[index],
            json["numberOfReactions"]
        );
    }
}

/**
 * A post in the game that may have been shown already.
 */
export class GamePost {
    // The study is not saved as part of the game states, it is only here for convenience.
    study; // Study

    post; // Post
    numberOfReactions; // {String: Number}
    comments; // GamePostComment[]
    shown; // Boolean

    constructor(study, post, numberOfReactions, comments, shown) {
        doTypeCheck(study, Study, "Post's Study");
        doTypeCheck(post, Post, "Post's Metadata");
        doTypeCheck(numberOfReactions, "object", "Number of reactions for the post");
        doArrayTypeCheck(comments, GamePostComment, "Comments on Post");
        doNullableTypeCheck(shown, "boolean", "Whether the post has been shown");
        this.study = study;
        this.post = post;
        this.numberOfReactions = numberOfReactions;
        this.comments = comments;
        this.shown = !!shown;
    }

    /**
     * Returns a new GamePost for this post after it has been shown.
     */
    adjustAfterShown() {
        return new GamePost(this.study, this.post, this.numberOfReactions, this.comments, true);
    }

    static commentsToJSON(comments) {
        const commentsJSON = [];
        for (let index = 0; index < comments.length; ++index) {
            commentsJSON.push(comments[index].toJSON())
        }
        return commentsJSON;
    }

    static commentsFromJSON(json, post) {
        const comments = [];
        for (let index = 0; index < json.length; ++index) {
            comments.push(GamePostComment.fromJSON(json[index], index, post));
        }
        return comments;
    }

    toJSON() {
        return {
            "postID": this.post.id,
            "numberOfReactions": this.numberOfReactions,
            "comments": GamePost.commentsToJSON(this.comments),
            "shown": this.shown
        };
    }

    static fromJSON(json, study) {
        const post = study.getPost(json["postID"]);
        const comments = GamePost.commentsFromJSON(json["comments"], post);
        return new GamePost(
            study,
            post,
            json["numberOfReactions"],
            comments,
            json["shown"]
        );
    }

    /**
     * Selects a random post to show, with a {@param truePostPercentage}
     * percent chance of selecting a true post.
     *
     * @param posts The array of posts to choose from.
     * @param truePostPercentage A percentage value between 0 and 100.
     */
    static selectRandomPost(posts, truePostPercentage) {
        const selectTruePosts = 100 * Math.random() < truePostPercentage;
        const availablePosts = filterArray(posts, (post) => !post.shown);
        if (availablePosts.length === 0)
            throw new Error("Used up all available posts");

        return selectRandomElement(
            availablePosts,
            (post) => selectTruePosts === post.post.isTrue // Soft Filter
        );
    }

    /**
     * Returns the first post in {@param posts} that has the ID {@param id}.
     */
    static findById(posts, id) {
        for (let index = 0; index < posts.length; ++index) {
            const post = posts[index];
            if (post.post.id === id)
                return post;
        }
        throw new Error("Could not find post with ID " + id);
    }

    /**
     * Creates a new post for use in the game by sampling its
     * number of reactions from the supplied distribution.
     */
    static sampleNewPost(study, post) {
        doTypeCheck(study, Study, "Study")
        doTypeCheck(post, Post, "Post");
        const numberOfReactions = post.numberOfReactions.sampleAll();
        const comments = [];
        for (let index = 0; index < post.comments.length; ++index) {
            const comment = post.comments[index];
            const commentNumberOfReactions = comment.numberOfReactions.sampleAll();
            comments.push(new GamePostComment(comment, commentNumberOfReactions));
        }
        return new GamePost(study, post, numberOfReactions, comments, false);
    }
}

/**
 * Holds the current state of a game.
 */
export class GameState {
    // The study is not saved as part of the game states, it is only here for convenience.
    study; // Study
    indexInGame; // Number

    currentSource; // GameSource
    currentPost; // GamePost

    constructor(study, indexInGame, currentSource, currentPost) {
        doTypeCheck(study, Study, "Game's Study");
        doTypeCheck(indexInGame, "number", "Index of State in the Game")
        doTypeCheck(currentSource, GameSource, "Game's Current Source");
        doTypeCheck(currentPost, GamePost, "Game's Current Post");
        this.study = study;
        this.indexInGame = indexInGame;
        this.currentSource = currentSource;
        this.currentPost = currentPost;
    }

    toJSON() {
        return {
            "currentSource": this.currentSource.toJSON(),
            "currentPost": this.currentPost.toJSON()
        };
    }

    static fromJSON(json, study, indexInGame) {
        return new GameState(
            study,
            indexInGame,
            GameSource.fromJSON(json["currentSource"], study),
            GamePost.fromJSON(json["currentPost"], study),
            null,
            null
        );
    }
}


/**
 * Stores the reactions, credibility, and followers
 * of a participant throughout the game.
 */
export class GameParticipant {
    participantID; // String?
    postInteractions; // GamePostInteractionStore
    credibility; // Number
    followers; // Number
    credibilityHistory; // Number[]
    followerHistory; // Number[]

    constructor(participantID, credibility, followers,
                postInteractions, credibilityHistory, followerHistory) {

        doNullableTypeCheck(participantID, "string", "Participant's ID");
        doTypeCheck(credibility, "number", "Participant's Credibility");
        doTypeCheck(followers, "number", "Participant's Followers");
        doTypeCheck(postInteractions, GamePostInteractionStore, "Participant's Interactions with Posts");
        doNullableArrayTypeCheck(credibilityHistory, "number", "Participant's Credibility History");
        doNullableArrayTypeCheck(followerHistory, "number", "Participant's Follower History");
        this.participantID = participantID;
        this.credibility = credibility;
        this.followers = followers;
        this.postInteractions = postInteractions;
        this.credibilityHistory = credibilityHistory || [credibility];
        this.followerHistory = followerHistory || [followers];
    }

    addReaction(interaction, credibilityChange, followersChange) {
        doNullableTypeCheck(interaction, GamePostInteraction, "Participant's Interactions with a Post");
        doTypeCheck(credibilityChange, "number", "Participant's Credibility Change after Reaction");
        doTypeCheck(followersChange, "number", "Participant's Followers Change after Reaction");
        this.postInteractions.push(interaction);
        this.credibility = adjustCredibility(this.credibility, credibilityChange);
        this.followers = adjustFollowers(this.followers, followersChange);
        this.credibilityHistory.push(this.credibility);
        this.followerHistory.push(this.followers);
    }

    toJSON() {
        return {
            "participantID": this.participantID,
            "credibility": this.credibility,
            "followers": this.followers,
            "interactions": this.postInteractions.toJSON(),
            "credibilityHistory": this.credibilityHistory,
            "followerHistory": this.followerHistory
        };
    }

    static fromJSON(json) {
        return new GameParticipant(
            json["participantID"],
            json["credibility"],
            json["followers"],
            GamePostInteractionStore.fromJSON(json["interactions"]),
            json["credibilityHistory"],
            json["followerHistory"]
        );
    }
}

/**
 * Provides the logic for running a game.
 */
export class Game {
    study; // Study
    studyModTime; // Number (UNIX Epoch Time in Seconds)
    sessionID; // String
    startTime; // Number (UNIX Epoch Time in Seconds)
    endTime; // Number (UNIX Epoch Time in Seconds), or null
    states; // GameState[]
    latestStatePosts; // GameSource[], or null
    latestStateSources; // GamePost[], or null
    participant; // GameParticipant
    dismissedPrompt; // Boolean
    completionCode; // String

    saveResultsToDatabasePromise; // Promise, not saved

    constructor(study, studyModTime, sessionID, startTime, endTime,
                states, participant, dismissedPrompt, completionCode) {

        doTypeCheck(study, Study, "Game Study");
        doTypeCheck(studyModTime, "number", "Game Study Modification Time");
        doTypeCheck(sessionID, "string", "Game Session ID")
        doTypeCheck(startTime, "number", "Game Start Time");
        doNullableTypeCheck(endTime, "number", "Game End Time");
        doTypeCheck(states, Array, "Game States");
        doTypeCheck(participant, GameParticipant, "Game Participant");
        doTypeCheck(dismissedPrompt, "boolean", "Whether the prompt has been dismissed");
        doNullableTypeCheck(completionCode, "string", "Game Completion Code");
        this.sessionID = sessionID;
        this.study = study;
        this.studyModTime = studyModTime;
        this.startTime = startTime;
        this.endTime = endTime || null;
        this.states = states;
        this.latestStatePosts = null;
        this.latestStateSources = null;
        this.participant = participant;
        this.dismissedPrompt = dismissedPrompt;
        this.completionCode = completionCode;

        this.saveResultsToDatabasePromise = null;
    }

    /**
     * Saves this game to local storage.
     */
    saveLocally() {
        if (typeof localStorage === "undefined")
            return;
        localStorage.setItem("game", JSON.stringify(this.toJSON()));
    }

    /**
     * Saves this game to the database.
     */
    saveToDatabase() {
        this.saveResultsToDatabasePromise = postResults(this.study, this);
        return this.saveResultsToDatabasePromise;
    }

    /**
     * After the game is finished, the results will automatically be
     * saved to the database. Once this upload has started, this
     * Promise will be populated to keep track of the progress of
     * that upload.
     */
    getSaveToDatabasePromise() {
        return this.saveResultsToDatabasePromise;
    }

    /**
     * Returns whether there are no more posts to show to the participant.
     */
    isFinished() {
        return this.participant.postInteractions.getSubmittedPostsCount() >= this.study.basicSettings.length;
    }

    /**
     * Returns the stage of the game that the user should be shown right now.
     */
    getCurrentStage() {
        if (!this.participant.participantID && this.study.basicSettings.requireIdentification)
            return "identification";
        if (this.isFinished())
            return "debrief";
        if (this.dismissedPrompt)
            return "game";
        return "introduction";
    }

    getCurrentState() {
        if (this.isFinished())
            throw new Error("The game has been finished!");

        return this.states[this.participant.postInteractions.getSubmittedPostsCount()];
    }

    /**
     * Preloads the images required for the next states.
     */
    preloadNextState() {
        const nextIndex = this.participant.postInteractions.getSubmittedPostsCount() + 1;
        if (nextIndex >= this.states.length)
            return;

        this.preloadState(this.states[nextIndex]);
    }

    /**
     * Preloads the images required for the given state.
     */
    preloadState(state) {
        const source = state.currentSource.source;
        const post = state.currentPost.post;

        const manager = getDataManager();
        if (source.avatar) {
            manager.getStudyImage(this.study, source.id, source.avatar);
        }
        if (!isOfType(post.content, "string")) {
            manager.getStudyImage(this.study, post.id, post.content);
        }
    }

    /**
     * Advances to the next state in the game after the participant interacted with the
     * highest current post. The highest current post is the visible post if not in
     * feed-mode, or the first visible post in feed-mode.
     *
     * @param interactions the interactions that the participant made with the highest current post.
     */
    advanceStates(interactions) {
        doArrayTypeCheck(interactions, GamePostInteraction, "Interactions with the Current Post")

        for (let index = 0; index < interactions.length; ++index) {
            this.submitInteraction(interactions[index]);
        }

        // Generate a completion code when the game is finished.
        if (this.isFinished()) {
            if (this.study.advancedSettings.genCompletionCode) {
                this.completionCode = this.study.generateRandomCompletionCode();
            }
            this.endTime = getUnixEpochTimeSeconds();
        }

        // Allows us to restore the game if the user refreshes the page.
        this.saveLocally();

        // Allows us to create the results for this game.
        if (this.isFinished()) {
            this.saveToDatabase();
        }
    }

    submitInteraction(interaction) {
        if (!interaction.isCompleted())
            throw new Error("The interaction with the current post must be completed");

        // Calculate and apply the changes to participant's credibility and followers.
        const postReactions = interaction.postReactions;
        let credibilityChange = 0,
            followerChange = 0;

        const post = this.getCurrentState().currentPost.post;
        for (let index = 0; index < postReactions.length; ++index) {
            const reaction = postReactions[index];
            if (reaction === "skip")
                continue;

            credibilityChange += post.changesToCredibility[reaction].sample();
            followerChange += post.changesToFollowers[reaction].sample();
        }
        this.participant.addReaction(interaction, credibilityChange, followerChange);
    }

    calculateAllStates() {
        while (this.states.length < this.study.basicSettings.length) {
            this.calculateNextState();
        }
    }

    calculateNextState() {
        if (this.states.length >= this.study.basicSettings.length)
            throw new Error("Already calculated all states for study");

        // Get or create the sources and posts arrays.
        let currentSources = this.latestStateSources;
        let currentPosts = this.latestStatePosts;
        if (currentSources === null || currentPosts === null) {
            currentSources = [];
            currentPosts = [];
            for (let index = 0; index < this.study.sources.length; ++index) {
                currentSources.push(
                    GameSource.sampleNewSource(this.study, this.study.sources[index])
                );
            }
            for (let index = 0; index < this.study.posts.length; ++index) {
                currentPosts.push(
                    GamePost.sampleNewPost(this.study, this.study.posts[index])
                );
            }
        }

        // Make the source/post selection.
        const selectionMethod = this.study.sourcePostSelectionMethod;
        const sourcePostPair = selectionMethod.makeSelection(this.states.length, currentSources, currentPosts);
        const selectedSource = GameSource.findById(currentSources, sourcePostPair[0]);
        const selectedPost = GamePost.findById(currentPosts, sourcePostPair[1]);

        // Adjust the state of the source and post.
        const credibilityChangeDist = selectedPost.post.changesToCredibility.share;
        const followersChangeDist = selectedPost.post.changesToFollowers.share;
        const newSource = selectedSource.adjustAfterPost(
            // These may be missing if shares are disabled.
            (credibilityChangeDist ? credibilityChangeDist.sample() : 0),
            (followersChangeDist ? followersChangeDist.sample() : 0)
        );
        const newPost = selectedPost.adjustAfterShown();

        // Create the new source & post arrays after they've been shown.
        const nextSources = [];
        const nextPosts = [];
        for (let index = 0; index < currentSources.length; ++index) {
            const source = currentSources[index];
            nextSources.push(source.source.id === newSource.source.id ? newSource : source);
        }
        for (let index = 0; index < currentPosts.length; ++index) {
            const post = currentPosts[index];
            nextPosts.push(post.post.id === newPost.post.id ? newPost : post);
        }

        // Create the new state.
        const newState = new GameState(this.study, this.states.length, selectedSource, selectedPost);
        this.states.push(newState);
        this.latestStateSources = nextSources;
        this.latestStatePosts = nextPosts;
        return newState;
    }

    static statesToJSON(states) {
        const jsonStates = [];
        for (let index = 0; index < states.length; ++index) {
            jsonStates.push(states[index].toJSON());
        }
        return jsonStates;
    }

    static statesFromJSON(json, study) {
        const states = [];
        for (let index = 0; index < json.length; ++index) {
            states.push(GameState.fromJSON(json[index], study, index));
        }
        return states;
    }

    toJSON() {
        const json = {
            "studyID": this.study.id,
            "studyModTime": this.studyModTime,
            "sessionID": this.sessionID,
            "startTime": this.startTime,
            "endTime": this.endTime,
            "states": Game.statesToJSON(this.states),
            "participant": this.participant.toJSON(),
            "dismissedPrompt": this.dismissedPrompt,
            "completionCode": this.completionCode || null  // Firebase doesn't like undefined
        };
        return json;
    }

    static fromJSON(json, study) {
        // We used to store the whole study settings in the results.
        let studyModTime;
        if (json["study"] !== undefined) {
            const legacyStudy = Study.fromJSON(json["studyID"], json["study"]);
            studyModTime = legacyStudy.lastModifiedTime;
        } else {
            studyModTime = json["studyModTime"]
        }
        return new Game(
            study, studyModTime,
            json["sessionID"],
            json["startTime"],
            json["endTime"],
            Game.statesFromJSON(json["states"], study),
            GameParticipant.fromJSON(json["participant"]),
            json["dismissedPrompt"],
            json["completionCode"] || null
        );
    }

    /**
     * Creates a new game for a participant in {@param study}.
     */
    static createNew(study) {
        if (isOfType(study, BrokenStudy))
            throw new Error("The study is broken: " + study.error);

        doTypeCheck(study, Study, "Game Study");
        const sessionID = generateUID();
        const participant = new GameParticipant(null, 50, 0);
        const game = new Game(
            study, study.lastModifiedTime, sessionID,
            getUnixEpochTimeSeconds(),
            null, [], participant, false
        );
        game.calculateAllStates();
        game.saveLocally();
        return game;
    }
}

/**
 * Converts {@param game} to JSON and back, and
 * returns an array with all changes between
 * the original game and the reconstructed one.
 * This should return an empty array if everything
 * is working correctly.
 */
export function getGameChangesToAndFromJSON(game) {
    // Convert to JSON.
    const jsonObject = compressJson(game.toJSON());
    const jsonString = JSON.stringify(jsonObject);

    // Convert from JSON.
    const reconstructedJSON = decompressJson(JSON.parse(jsonString));
    const reconstructedGame = Game.fromJSON(reconstructedJSON, game.study);

    // Do the diff on the JSON created from each, as
    // doing it on the full objects is too slow. It's
    // not ideal, but it should be good enough.
    return odiff(jsonObject, compressJson(reconstructedGame.toJSON()));
}

