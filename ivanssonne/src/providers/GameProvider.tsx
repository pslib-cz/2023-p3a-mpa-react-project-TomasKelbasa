import React, { createContext, PropsWithChildren, Reducer, useContext, useReducer } from 'react';
import { PieceType } from '../components/Piece';
import { Stack } from 'stack-typescript';
import { tilePayload, TileType, tileTypes } from '../data/tile_type';
import { v4 as uuidv4 } from 'uuid';
import { SettingsContext, TypeOfGame, MeepleColors } from './SettingsProvider';
import { GameActionTypes } from './utilities';


const firstPiecePosition = [25, 25];

export type PlayerType = {
    id: string,
    name: string,
    meepleColor: MeepleColors
    score: number,
    numberOfMeeples: number,
}

export type MeepleType = {
    id: string,
    playerId: string,
    positionX: number,
    positionY: number,
    positionInPiece: number[]
}

export type GameState = {
    placedPieces: PieceType[],
    unplacedPieces: Stack<PieceType>,
    currentPiece: PieceType | null,
    currentPieceImpossibleToPlace: boolean,
    currentlyPlacedPieceId: string | null,
    meeples: MeepleType[],
    players: PlayerType[],
    currentPlayerId: string,
    possiblePiecePlacements: number[][],
    gameEnded: boolean,
    showResult: boolean,
    messageLog: string[]
}

export type GameAction = {
    type: GameActionTypes.PLACE_PIECE,
    locationX: number,
    locationY: number,
} | {
    type: GameActionTypes.RESET_GAME
} | {
    type: GameActionTypes.ROTATE_CURRENT_PIECE,
    direction: 'left' | 'right'
} | {
    type: GameActionTypes.END_TURN
} | {
    type: GameActionTypes.PLACE_MEEPLE,
    position: number[]
} | {
    type: GameActionTypes.GET_NEW_PIECE,
} | {
    type: GameActionTypes.REWARD_PLAYER,
    playerId: string,
    score: number,
    message: string
} | {
    type: GameActionTypes.REMOVE_MEEPLE,
    meepleId: string
} | {
    type: GameActionTypes.END_GAME
}
/*
*  all rotations must be done using this function!
*  rotation = angle in pi/2 radians from 1 to 3
*/
const rotatePiece = (piece: PieceType, rotation: number): PieceType => {
    if(rotation < 1 || rotation > 3) throw new Error("Rotation must be between 1 and 3");
    return {
        ...piece,
        rotation: (piece.rotation + rotation) % 4,
        tile: {
            ...piece.tile,
            fields: piece.tile.fields.map(field => {
                return ({
                    sides: field.sides.map(f => {
                        const t = [...f];
                        t[0] = (t[0] + rotation - 1) % 4 + 1;
                        return t;
                    })
                    
                })
            }),
            roads: piece.tile.roads.map(road => {
                return {
                    sides: road.sides.map(num => {
                        return (num + rotation - 1) % 4 + 1;
                    })
                } 
            }),
            towns: piece.tile.towns.map(town => {
                return {
                    ...town,
                    sides: town.sides.map(num => {
                        return (num + rotation - 1) % 4 + 1;
                    })
                } 
            })

        }
    };
}

const calculatePossiblePlacements = (state: GameState, cPiece: PieceType): number[][] => {

        if(state.placedPieces.length <= 0) return [[...firstPiecePosition]];

        const possiblePlacements: number[][] = [];
        const impossiblePlacements: number[][] = [];

        state.placedPieces.forEach(piece => {
            let pos: number[] = [];
            for(let i = 1; i <= 4; i++){
                
                switch(i){
                    case 1:
                        pos = [piece.positionX, piece.positionY + 1];
                        break;
                    case 2:
                        pos = [piece.positionX - 1, piece.positionY];
                        break;
                    case 3:
                        pos = [piece.positionX, piece.positionY - 1];
                        break;
                    case 4:
                        pos = [piece.positionX + 1, piece.positionY];
                        break;
                        
                }
                
                if(impossiblePlacements.find(ip => ip[0] === pos[0] && ip[1] === pos[1]) !== undefined) continue;
                if(state.placedPieces.find(p => p.positionX === pos[0] && p.positionY === pos[1]) !== undefined){
                    impossiblePlacements.push([...pos]);
                    continue;
                }
                if(arePiecesCompatible(piece, cPiece, i)){
                    if(possiblePlacements.find(a => a[0] === pos[0] && a[1] === pos[1]) === undefined) possiblePlacements.push([...pos]);
                }
                else{
                    impossiblePlacements.push([...pos]);
                }
            }
                
        });

        return possiblePlacements.filter(p => impossiblePlacements.find(ip => ip[0] === p[0] && ip[1] === p[1]) === undefined);
}



const initialGameReducerState: GameState = {
    meeples: [],
    placedPieces: [],
    currentPiece: null,
    currentPieceImpossibleToPlace: false,
    currentlyPlacedPieceId: null,
    possiblePiecePlacements: [],
    players: [],
    unplacedPieces: new Stack<PieceType>(),
    currentPlayerId: '',
    gameEnded: false,
    showResult: false,
    messageLog: ["Hra začala!"]
}

export type GameContextType = {
    state: GameState
    dispatch: React.Dispatch<GameAction>
}

export const GameContext = createContext<GameContextType>({state: initialGameReducerState, dispatch: () => {}});



const GameProvider: React.FC<PropsWithChildren> = ({children}) => {

    const settingsContext = useContext(SettingsContext);

    const gameReducer: Reducer<GameState, GameAction> = (state, action) => {

        switch (action.type) {
            case GameActionTypes.PLACE_PIECE:
                if(!state.currentPiece) return state;
                if(state.possiblePiecePlacements.find(p => p[0] === action.locationX && p[1] === action.locationY) === undefined) return state;

                return {
                    ...state,
                    currentlyPlacedPieceId: state.currentPiece.id,
                    currentPiece: null,
                    possiblePiecePlacements: [],
                    placedPieces: [...state.placedPieces, {...state.currentPiece, positionX: action.locationX, positionY: action.locationY, placed: true} as PieceType]
                }
            case GameActionTypes.PLACE_MEEPLE: {
                const cPlayer  = state.players.find(p => p.id === state.currentPlayerId);

                if(!cPlayer) return state;
                if(cPlayer.numberOfMeeples <= 0) return state;

                const cpp = state.placedPieces.find(p => p.id === state.currentlyPlacedPieceId);

                const meeple: MeepleType = {
                    id: uuidv4(),
                    playerId: cPlayer.id,
                    positionX: cpp?.positionX as number,
                    positionY: cpp?.positionY as number,
                    positionInPiece: action.position
                }
                return {
                    ...state,
                    meeples: [...state.meeples, meeple],
                    players: [...state.players.map(p => {
                        if(p.id === cPlayer?.id){
                            return {...cPlayer, numberOfMeeples: cPlayer.numberOfMeeples - 1};    
                        }else{
                            return p;
                        }
                    })]
                }
            }
            case GameActionTypes.ROTATE_CURRENT_PIECE: {
                if(state.currentPiece === null) return state;
                const rotatedPiece = rotatePiece(state.currentPiece, action.direction === 'left' ? 3 : 1);
                return {
                    ...state,
                    currentPiece: rotatedPiece,
                    possiblePiecePlacements: calculatePossiblePlacements(state, rotatedPiece)
                }
            }
            case GameActionTypes.REMOVE_MEEPLE: {
                const meepleToRemove = state.meeples.find(m => m.id === action.meepleId);
                if(!meepleToRemove) return state;
                const playerToRemoveMeeple = state.players.find(p => p.id === meepleToRemove.playerId);
                if(!playerToRemoveMeeple) return state;

                return {
                    ...state,
                    meeples: state.meeples.filter(m => m.id !== action.meepleId),
                    players: state.players.map(p => {
                        if(p.id === playerToRemoveMeeple.id){
                            return {...p, numberOfMeeples: p.numberOfMeeples + 1};
                        }else{
                            return p;
                        }
                    })
                }
            }
            case GameActionTypes.REWARD_PLAYER: {
                const player = state.players.find(p => p.id === action.playerId);
                if(!player) return state;
                return {
                    ...state,
                    players: state.players.map(p => {
                        if(p.id === action.playerId){
                            return {...p, score: p.score + action.score};
                        }else{
                            return p;
                        }
                    }),
                    messageLog: [...state.messageLog,  `<span class="player-color" style="color: ${player.meepleColor}">${player.name}</span>${action.message}`]

                }
            }
            case GameActionTypes.END_TURN: {

                if(state.unplacedPieces.length <= 0){

                    console.log("Game over");
                    return {
                        ...state,
                        currentlyPlacedPieceId: null,
                        currentPiece: null,
                        possiblePiecePlacements: [],
                        gameEnded: true
                    };
                }

                const stackDupe = new Stack<PieceType>(...state.unplacedPieces);

                let cPiece = stackDupe.pop();
                let possiblePlacements = calculatePossiblePlacements(state, cPiece);

                let rotations = 0;

                const cPId = state.players.find(p => p.id !== state.currentPlayerId)?.id;
                if(!cPId) throw new Error("Invalid player id");

                while(possiblePlacements.length <= 0){
                    rotations++;
                    cPiece = rotatePiece(cPiece, 1);
                    possiblePlacements = calculatePossiblePlacements(state, cPiece);
                    if(rotations >= 4){
                        return {
                            ...state,
                            currentlyPlacedPieceId: null,
                            currentPlayerId: cPId,
                            currentPiece: cPiece,
                            unplacedPieces: stackDupe,
                            possiblePiecePlacements: [],
                            currentPieceImpossibleToPlace: true
                        }
                        
                    }
                }

                return {
                    ...state,
                    currentlyPlacedPieceId: null,
                    currentPlayerId: cPId,
                    currentPiece: cPiece,
                    unplacedPieces: stackDupe,
                    possiblePiecePlacements: possiblePlacements
                }
            }
            case GameActionTypes.GET_NEW_PIECE: {
                if(!state.currentPieceImpossibleToPlace) return state;
                const stackCopy = new Stack<PieceType>(...state.unplacedPieces);

                if(stackCopy.length <= 0){

                    console.log("Game over");
                    return {
                        ...state,
                        currentlyPlacedPieceId: null,
                        currentPiece: null,
                        possiblePiecePlacements: [],
                        currentPieceImpossibleToPlace: false,
                        gameEnded: true
                    };
                }

                let cp = stackCopy.pop();
                let pp = calculatePossiblePlacements(state, cp);

                let rot = 0;

                while(pp.length <= 0){
                    rot++;
                    cp = rotatePiece(cp, 1);
                    pp = calculatePossiblePlacements(state, cp);
                    if(rot >= 4){
                        return {
                            ...state,
                            currentlyPlacedPieceId: null,
                            currentPiece: cp,
                            unplacedPieces: stackCopy,
                            possiblePiecePlacements: [],
                            currentPieceImpossibleToPlace: true
                        }
                    }
                }

                return {
                    ...state,
                    currentlyPlacedPieceId: null,
                    currentPiece: cp,
                    unplacedPieces: stackCopy,
                    possiblePiecePlacements: pp,
                    currentPieceImpossibleToPlace: false
                }

            }
            case GameActionTypes.RESET_GAME: {
                const arr: PieceType[] = [];
                tilePayload.forEach(tile => {
                    for(let i = 0; i < tile.value; i++) {
                        const t: PieceType = {
                            id: uuidv4(),
                            placed: false,
                            rotation: 0,
                            positionX: 0,
                            positionY: 0,
                            tile: tileTypes.find(t => t.type === tile.letter) as TileType
                        }
                        arr.push(t);
                    }
                
                });
                arr.sort(() => Math.random() - 0.5);
                const stack = new Stack<PieceType>(...arr);
                const currentPiece = stack.pop();
                
                const players: PlayerType[] = []

                if(settingsContext.state.typeOfGame === TypeOfGame.PVP){
                    players.push({id: uuidv4(), name: settingsContext.state.firstName, score: 0, meepleColor: settingsContext.state.firstColor, numberOfMeeples: 8})
                    players.push({id: uuidv4(), name: settingsContext.state.secondName, score: 0, meepleColor: settingsContext.state.secondColor, numberOfMeeples: 8})
                }
                else if(settingsContext.state.typeOfGame === TypeOfGame.PVC){
                    // TODO
                }

                return {
                    ...initialGameReducerState,
                    unplacedPieces: stack,
                    currentPiece: currentPiece,
                    currentPlayerId: players[0].id,
                    possiblePiecePlacements: [[...firstPiecePosition]],
                    players: players
                };
            }
            case GameActionTypes.END_GAME:
                return {...state, showResult: true, meeples: []}

            default:
                return state;
        }
    }

    const [state, dispatch] = useReducer(gameReducer, initialGameReducerState);

    return (
        <GameContext.Provider value={{state: state, dispatch: dispatch}}>
            {children}
        </GameContext.Provider>
    )
}

export default GameProvider;

/// piece1touchingSide is the side of piece1 that is touching piece2 (1 = bottom, 2 = left, 3 = top, 4 = right)
const arePiecesCompatible = (piece1: PieceType, piece2: PieceType, piece1touchingSide: number): boolean => {

    let piece2touchingSide: number;
    switch(piece1touchingSide){
        case 1:
            piece2touchingSide = 3;
            break;
        case 2:
            piece2touchingSide = 4;
            break;
        case 3:
            piece2touchingSide = 1;
            break;
        case 4:
            piece2touchingSide = 2;
            break;
        default:
            throw new Error("Invalid side");
    }
    
    const piece1town = piece1.tile.towns.find(town => town.sides.find(a => a === piece1touchingSide) !== undefined) !== undefined;
    const piece2town = piece2.tile.towns.find(town => town.sides.find(a => a === piece2touchingSide) !== undefined) !== undefined;
    if(piece1town !== piece2town) return false;

    const piece1road = piece1.tile.roads.find(road => road.sides.find(a => a === piece1touchingSide) !== undefined) !== undefined;
    const piece2road = piece2.tile.roads.find(road => road.sides.find(a => a === piece2touchingSide) !== undefined) !== undefined;
    if(piece1road !== piece2road) return false;

    const piece1fields = piece1.tile.fields.filter(field => field.sides.find(a => a[0] === piece1touchingSide) !== undefined).map(field => field.sides.find(a => a[0] === piece1touchingSide) as [number, number]);
    const piece2fields = piece2.tile.fields.filter(field => field.sides.find(a => a[0] === piece2touchingSide) !== undefined).map(field => field.sides.find(a => a[0] === piece2touchingSide) as [number, number]);

    piece1fields.forEach(field1 => {
        if(piece2fields.find(field2 => field2 === field1) === undefined) return false;
    });
    piece2fields.forEach(field2 => {
        if(piece1fields.find(field1 => field1 === field2) === undefined) return false;
    });

    return true;
}

export type PieceSidePair = {
    pieceXpos: number,
    pieceYpos: number,
    side: number[]
}

export type StructureInfoType = {
    type: "T" | "R",
    meeples: MeepleType[],
    closed: boolean,
    sides: PieceSidePair[]
}